// EMA Calculator
function calculateEMA(data, parameters) {
  const period = parameters.period || 20;
  const source = parameters.source || 'close';
  const result = [];
  const multiplier = 2 / (period + 1);
  
  if (data.length < period) return [];
  
  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i][source];
  }
  let ema = sum / period;
  
  result.push({
    time: data[period - 1].time,
    value: ema
  });
  
  // Calculate remaining EMAs
  for (let i = period; i < data.length; i++) {
    ema = (data[i][source] * multiplier) + (ema * (1 - multiplier));
    result.push({
      time: data[i].time,
      value: ema
    });
  }
  
  return result;
}

module.exports = { calculateEMA };