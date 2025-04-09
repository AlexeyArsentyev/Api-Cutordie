const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const requestIp = require('request-ip');

const AppError = require('./utils/appError');
const globalErrorHandler = require('./controllers/errorController');
const courseRouter = require('./routes/courseRoutes');
const userRouter = require('./routes/userRoutes');

const app = express();

app.use(function(req, res, next) {
  var allowedDomains = ['http://localhost:3000', 'https://cut-or-die.onrender.com'];
  var origin = req.headers.origin;
  if (allowedDomains.indexOf(origin) > -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type, Accept');
  res.setHeader('Access-Control-Allow-Credentials', true);

  next();
});

//set security  http headers
app.use(helmet());

//for express rate limit working correctly
app.set('trust proxy', true);

//dev logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use(requestIp.mw());

const limiter = rateLimit({
  max: process.env.MAX_REQUESTS_PER_HOUR,
  windowMs: 60 * 60 * 1000,
  message: 'Too many requests from this IP. Please try again in an hour',
  keyGenerator: (req, res) => {
    return req.clientIp; // IP address from requestIp.mw()
  },
});

//limit requests from the same IP
app.use('/api', limiter);

//cookies
app.use(cookieParser());

//body parser
app.use(express.json({ limit: '10kb' }));

//data sanitization against NoSQL query injection and cross-side scripting attacks
app.use(mongoSanitize());

//data sanitization against XSS
app.use(xss());

//prevent parameters pollution
app.use(
  hpp({
    whitelist: ['duration', 'price', 'difficulty'],
  })
);

//serving static files
app.use(express.static(`${__dirname}/public`));

app.use(compression());

//cookies
app.use(cookieParser());

//routes
app.use('/api/v1/courses', courseRouter);
app.use('/api/v1/users', userRouter);

app.all('*', (req, res, next) => {
  next(new AppError(`Cant find ${req.originalUrl} on this server`, 500));
});

app.use(globalErrorHandler);

module.exports = app;
