#!/bin/bash
# API Key Setup Script for Liquidation Hunter

echo "=================================="
echo "LIQUIDATION HUNTER - API SETUP"
echo "=================================="
echo ""

echo "This script will help you add API keys to config.py"
echo ""

# Backup config
cp config.py config.py.backup
echo "✅ Created backup: config.py.backup"
echo ""

# Coinglass API
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. COINGLASS API (Liquidation Data)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Get your key from: https://www.coinglass.com/"
echo "Go to: Profile → API Management → Create API Key"
echo ""
read -p "Enter your Coinglass API key (or press Enter to skip): " COINGLASS_KEY

if [ ! -z "$COINGLASS_KEY" ]; then
    sed -i "s/COINGLASS_API_KEY = \"\"/COINGLASS_API_KEY = \"$COINGLASS_KEY\"/" config.py
    echo "✅ Coinglass API key added"
else
    echo "⏭️  Skipped - will use simulated liquidation data"
fi
echo ""

# KCEX API
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. KCEX API (Your Exchange)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  IMPORTANT: Create READ-ONLY API key!"
echo "Get from: KCEX → Account → API Management"
echo ""
read -p "Enter your KCEX API key (or press Enter to skip): " KCEX_KEY
read -p "Enter your KCEX Secret key (or press Enter to skip): " KCEX_SECRET

if [ ! -z "$KCEX_KEY" ]; then
    sed -i "s/KCEX_API_KEY = \"\"/KCEX_API_KEY = \"$KCEX_KEY\"/" config.py
    sed -i "s/KCEX_SECRET_KEY = \"\"/KCEX_SECRET_KEY = \"$KCEX_SECRET\"/" config.py
    echo "✅ KCEX API keys added"
else
    echo "⏭️  Skipped - will use Binance for price data"
fi
echo ""

# Binance API (optional)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. BINANCE API (Optional Backup)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -p "Add Binance API keys? (y/n): " ADD_BINANCE

if [ "$ADD_BINANCE" = "y" ]; then
    read -p "Binance API key: " BINANCE_KEY
    read -p "Binance Secret key: " BINANCE_SECRET

    sed -i "s/BINANCE_API_KEY = \"\"/BINANCE_API_KEY = \"$BINANCE_KEY\"/" config.py
    sed -i "s/BINANCE_SECRET_KEY = \"\"/BINANCE_SECRET_KEY = \"$BINANCE_SECRET\"/" config.py
    echo "✅ Binance API keys added"
else
    echo "⏭️  Skipped"
fi
echo ""

echo "=================================="
echo "✅ SETUP COMPLETE!"
echo "=================================="
echo ""
echo "Your API keys have been added to config.py"
echo "Backup saved as: config.py.backup"
echo ""
echo "Next steps:"
echo "1. Test with: python main.py scan -s BTCUSDT"
echo "2. Run backtest: python main.py backtest -s BTCUSDT -t 5m -d 7"
echo ""
echo "⚠️  SECURITY NOTE:"
echo "Never share config.py or commit it to public repos!"
echo ""
