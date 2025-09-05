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
  
  // Create lookup maps
  const fastEMAMap = new Map();
  const slowEMAMap = new Map();
  fastEMA.forEach(point => fastEMAMap.set(point.time, point.value));
  slowEMA.forEach(point => slowEMAMap.set(point.time, point.value));
  
  // Calculate MACD line for ALL data points (including warmup with null values)
  const macdLine = [];
  data.forEach(dataPoint => {
    const fastValue = fastEMAMap.get(dataPoint.time);
    const slowValue = slowEMAMap.get(dataPoint.time);
    
    if (fastValue !== undefined && slowValue !== undefined) {
      macdLine.push({
        time: dataPoint.time,
        value: fastValue - slowValue
      });
    } else {
      // Include warmup period with null values
      macdLine.push({
        time: dataPoint.time,
        value: null
      });
    }
  });
  
  // Calculate signal line (EMA of MACD) - only from valid MACD values
  const validMacdForSignal = macdLine.filter(point => point.value !== null);
  const signalEMA = calculateEMAFromData(validMacdForSignal, signalPeriod);
  
  // Create signal lookup map
  const signalMap = new Map();
  signalEMA.forEach(point => signalMap.set(point.time, point.value));
  
  // Create complete signal line with ALL data points (including warmup with null values)
  const signalLine = [];
  data.forEach(dataPoint => {
    const signalValue = signalMap.get(dataPoint.time);
    signalLine.push({
      time: dataPoint.time,
      value: signalValue !== undefined ? signalValue : null
    });
  });
  
  // Calculate histogram with complete timeline (including warmup with null values)
  const histogram = [];
  data.forEach(dataPoint => {
    const macdPoint = macdLine.find(p => p.time === dataPoint.time);
    const signalPoint = signalLine.find(p => p.time === dataPoint.time);
    
    if (macdPoint && signalPoint && macdPoint.value !== null && signalPoint.value !== null) {
      histogram.push({
        time: dataPoint.time,
        value: macdPoint.value - signalPoint.value
      });
    } else {
      // Include warmup period with null values
      histogram.push({
        time: dataPoint.time,
        value: null
      });
    }
  });
  
  return {
    macd: macdLine,
    signal: signalLine,
    histogram: histogram
  };
}

module.exports = { calculateMACD };