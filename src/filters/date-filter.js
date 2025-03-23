// Stolen from https://stackoverflow.com/a/31615643
const appendSuffix = n => {
  var s = ['th', 'st', 'nd', 'rd'],
    v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

module.exports = function dateFilter(value) {
  const dateObject = new Date(value);
  
  // Get the local date parts
  const localDate = new Date(dateObject.toLocaleString('en-US', { timeZone: 'UTC' }));

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayWithSuffix = appendSuffix(localDate.getDate());

  return `${dayWithSuffix} ${months[localDate.getMonth()]} ${localDate.getFullYear()}`;
};