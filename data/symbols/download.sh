#!/bin/bash
# Uso: ./baixar.sh SYMBOL INTERVAL
# Exemplo: ./baixar.sh BTCUSDT 1h

SYMBOL=${1:-BTCUSDT}
INTERVAL=${2:-1h}

# normaliza para minúsculo nos arquivos de saída
SYM_LOWER=$(echo "$SYMBOL" | tr '[:upper:]' '[:lower:]')
INT_LOWER=$(echo "$INTERVAL" | tr '[:upper:]' '[:lower:]')

# primeiro candle BTCUSDT = 2017-09-28 (1506556800000)
START=1506556800000
END=$(date +%s000)
OUT="${SYM_LOWER}_${INT_LOWER}.csv"
META="${SYM_LOWER}_${INT_LOWER}.json"

> $OUT
current=$START

while [ $current -lt $END ]; do
  url="https://api.binance.com/api/v3/klines?symbol=$SYMBOL&interval=$INTERVAL&startTime=$current&limit=1000"
  data=$(curl -s "$url")

  rows=$(echo "$data" | jq length)
  if [ "$rows" -eq 0 ]; then
    break
  fi

  echo "$data" | jq -r '.[] | @csv' >> $OUT

  # último closeTime (índice 6)
  current=$(echo "$data" | jq '.[-1][6]')
done

# --- Criar JSON de metadados ---
BASE=${SYMBOL%USDT}
QUOTE=${SYMBOL#$BASE}

cat > $META <<EOF
{
  "symbol": "$SYMBOL",
  "name": "$BASE",
  "description": "$BASE vs $QUOTE",
  "exchange": "Binance",
  "type": "crypto",
  "timeframe": "$INTERVAL",
  "baseAsset": "$BASE",
  "quoteAsset": "$QUOTE"
}
EOF

echo "✅ Histórico salvo em $OUT"
echo "✅ Metadados salvos em $META"
