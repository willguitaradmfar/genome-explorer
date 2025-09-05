// RSI Calculator
function calculateRSI(data, parameters) {
  const period = parameters.period || 14;
  const result = [];
  
  if (data.length === 0) {
    return result;
  }
  
  // Return complete timeline including warmup period with null values
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      // Warmup period - return null values
      result.push({
        time: data[i].time,
        value: null
      });
    } else {
      // Calculate RSI for valid positions
      let gains = 0;
      let losses = 0;
      
      // Calculate gains and losses for the period
      for (let j = i - period + 1; j <= i; j++) {
        const change = data[j].close - data[j - 1].close;
        if (change > 0) {
          gains += change;
        } else {
          losses += Math.abs(change);
        }
      }
      
      const avgGain = gains / period;
      const avgLoss = losses / period;
      
      let rsiValue;
      if (avgLoss === 0) {
        rsiValue = 100;
      } else {
        const rs = avgGain / avgLoss;
        rsiValue = 100 - (100 / (1 + rs));
      }
      
      result.push({
        time: data[i].time,
        value: rsiValue
      });
    }
  }
  
  return result;
}

module.exports = { calculateRSI };