module.exports = (inputString) => {
  // Regular expression check for acceptable characters
  const StandardCharactersPattern = /[^a-zA-Zа-яА-ЯёЁіІїЇєЄ0-9!@#$%^&*()_+=\-,.;\s]/;

  return !StandardCharactersPattern.test(inputString);
};
