module.exports = function w3cDate(value) {
    const dateObject = new Date(value);
    
    const year = dateObject.getFullYear();
    const month = String(dateObject.getMonth() + 1).padStart(2, '0'); // Ensure two-digit month format
  
    return `${year}-${month}`;
  };
  