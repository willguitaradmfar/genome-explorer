// MACD Calculator
function calculateEMA(data, period) {
  const result = [];
  const multiplier = 2 / (period + 1);
  
  if (data.length < period) return [];
  
  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  let ema = sum / period;
  
  result.push({
    time: data[period - 1].time,
    value: ema
  });
  
  // Calculate remaining EMAs
  for (let i = period; i < data.length; i++) {
    ema = (data[i].close * multiplier) + (ema * (1 - multiplier));
    result.push({
      time: data[i].time,
      value: ema
    });
  }
  
  return result;
}

function calculateEMAFromData(data, period) {
  const result = [];
  const multiplier = 2 / (period + 1);
  
  if (data.length < period) return [];
  
  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].value;
  }
  let ema = sum / period;
  
  result.push({
    time: data[period - 1].time,
    value: ema
  });
  
  // Calculate remaining EMAs
  for (let i = period; i < data.length; i++) {
    ema = (data[i].value * multiplier) + (ema * (1 - multiplier));
    result.push({
      time: data[i].time,
      value: ema
    });
  }
  
  return result;
}

function calculateMACD(data, parameters) {
  const fastPeriod = parameters.fastPeriod || 12;
  const slowPeriod = parameters.slowPeriod || 26;
  const signalPeriod = parameters.signalPeriod || 9;
  
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);
  const macdLine = [];
  
  // Calculate MACD line
  const startIndex = Math.max(fastEMA.length, slowEMA.length) - Math.min(fastEMA.length, slowEMA.length);
  
  for (let i = startIndex; i < Math.min(fastEMA.length, slowEMA.length); i++) {
    macdLine.push({
      time: fastEMA[i].time,
      value: fastEMA[i].value - slowEMA[i - startIndex].value
    });
  }
  
  // Calculate signal line (EMA of MACD)
  const signalLine = calculateEMAFromData(macdLine, signalPeriod);
  
  // Calculate histogram
  const histogram = [];
  for (let i = 0; i < Math.min(macdLine.length, signalLine.length); i++) {
    if (macdLine[i + (macdLine.length - signalLine.length)]) {
      histogram.push({
        time: signalLine[i].time,
        value: macdLine[i + (macdLine.length - signalLine.length)].value - signalLine[i].value
      });
    }
  }
  
  return {
    macd: macdLine,
    signal: signalLine,
    histogram: histogram
  };
}

module.exports = { calculateMACD };