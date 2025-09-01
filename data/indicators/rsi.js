// RSI Calculator
function calculateRSI(data, parameters) {
  const period = parameters.period || 14;
  const result = [];
  const changes = [];
  
  // Calculate price changes
  for (let i = 1; i < data.length; i++) {
    changes.push(data[i].close - data[i - 1].close);
  }
  
  // Calculate RSI
  for (let i = period - 1; i < changes.length; i++) {
    let gains = 0;
    let losses = 0;
    
    for (let j = i - period + 1; j <= i; j++) {
      if (changes[j] > 0) {
        gains += changes[j];
      } else {
        losses += Math.abs(changes[j]);
      }
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) {
      result.push({
        time: data[i + 1].time,
        value: 100
      });
    } else {
      const rs = avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      
      result.push({
        time: data[i + 1].time,
        value: rsi
      });
    }
  }
  
  return result;
}

module.exports = { calculateRSI };