const AppError = require('../utils/appError');
const Course = require('./../models/courseModel');
const User = require('./../models/userModel');
const APIFeatures = require('./../utils/apiFeatures');
const catchAsync = require('./../utils/catchAsync');

const { google } = require('googleapis');

exports.getAllCourses = catchAsync(async (req, res, next) => {
  const features = new APIFeatures(Course.find(), req.query)
    .filter()
    .sort()
    .limitFields();

  const courses = await features.query;

  res.status(200).json({
    status: 'success',
    results: courses.Length,
    data: { courses },
  });
});

exports.getCourse = catchAsync(async (req, res, next) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    return next(new AppError('No course found with this ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { course },
  });
});

exports.createCourse = catchAsync(async (req, res, next) => {
  const newCourse = await Course.create(req.body);

  res.status(201).json({
    status: 'success',
    data: {
      course: newCourse,
    },
  });
});

exports.updateCourse = catchAsync(async (req, res, next) => {
  const course = await Course.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!course) {
    return next(new AppError('No course found with this ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      course,
    },
  });
});

exports.deleteCourse = catchAsync(async (req, res) => {
  const course = await Course.findByIdAndDelete(req.params.id);

  if (!course) {
    return next(new AppError('No course found with this ID', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.createInvoice = catchAsync(async (req, res, next) => {
  const id = req.params.id;
  const user = req.user;

  const course = await Course.findById(id);

  if (!course) {
    return next(new AppError('No course found with this ID', 404));
  }

  if (user.purchasedCourses.includes(id)) {
    return next(new AppError('Course already acquired', 400));
  }

  const xtoken =
    process.env.NODE_ENV === 'production' ? process.env.XTOKEN : process.env.XTOKEN_DEV;

  const url = 'https://api.monobank.ua/api/merchant/invoice/create';
  const data = {
    amount: course.price.uah, //cents or copiyka according to currency
    ccy: 980,
    merchantPaymInfo: {
      reference: process.env.MERCHANT_PAYM_INFO,
      destination: course.en.name,
      comment: 'Cut or die haircut course',
    },
    redirectUrl: 'https://cut-or-die.onrender.com',
    webHookUrl: process.env.WEBHOOK_URL,
    validity: 3600,
    paymentType: 'debit',
    saveCardData: {
      saveCard: true,
      walletId: process.env.WALLET_ID,
    },
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Token': xtoken,
      },
      body: JSON.stringify(data),
    });
  } catch (err) {
    console.log(err);
  }

  const result = await response.json();

  console.log(result);

  const invoiceId = result.invoiceId;
  const courseId = course._id;

  user.invoices.push({ invoiceId, courseId });

  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    data: {
      pageUrl: result.pageUrl,
    },
  });
});

exports.validatePayment = catchAsync(async (req, res, next) => {
  console.log('MONOBANK REDIRECT SUCCESS!');
  console.log('body', req.body);
  if (req.body.status !== 'success') {
    return next(new AppError('Invoice is not paid yet', 202));
  }

  const invoiceId = req.body.invoiceId;
  const user = await User.findOne({ 'invoices.invoiceId': invoiceId });

  const invoice = user.invoices[0];
  const courseId = invoice.courseId;

  const userId = user._id;

  if (!user) {
    console.error('No user found that matches invoiceId');
    return next(new AppError('No user found with this invoiceId', 404));
  }

  const course = await Course.findById(courseId);

  if (!course) {
    return next(new AppError('No course found with this invoiceId', 404));
  }

  user.purchasedCourses.push(course._id);

  await user.save({ validateBeforeSave: false });

  console.log('SUCCESS');
  console.log(user.userName, course.name);

  res.status(200).json({
    status: 'success',
    data: {
      invoiceId,
      courseId,
      userId,
    },
  });
});

exports.giveAccess = catchAsync(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    return next(new AppError('No course found with this ID', 404));
  }

  const user = req.user;

  const auth = new google.auth.JWT(
    process.env.SERVICE_ACCOUNT_EMAIL,
    null,
    process.env.SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/drive']
  );

  const fileId = course.fileId;

  const drive = google.drive('v3');
  const result = await drive.permissions.create({
    auth,
    fileId: '1TTcG6LUynoBgZzLYDPbQM4e5cfo6sNek',
    requestBody: {
      role: 'reader',
      type: 'user',
      emailAddress: user.email,
    },
    fields: 'id',
  });

  const id = result.data.id;

  res.status(200).json({
    status: 'success',
    data: { id },
  });
});

exports.authorizeDisk = catchAsync(async (req, res, next) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    return next(new AppError('No course found with this ID', 404));
  }

  const user = req.user;

  const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URL
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'online',
    scope: 'https://www.googleapis.com/auth/drive.appdata',
  });

  console.log(authUrl);

  res.status(200).json({
    status: 'success',
    data: {
      authUrl,
    },
  });
});
