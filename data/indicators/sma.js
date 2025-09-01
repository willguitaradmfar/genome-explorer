// SMA Calculator
function calculateSMA(data, parameters) {
  const period = parameters.period || 20;
  const source = parameters.source || 'close';
  const result = [];
  
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j][source];
    }
    
    result.push({
      time: data[i].time,
      value: sum / period
    });
  }
  
  return result;
}

module.exports = { calculateSMA };