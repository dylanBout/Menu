# Liquidation Hunter Trading System

A production-ready cryptocurrency trading system that uses **liquidation heatmap data** to identify and trade high-probability reversal zones. Designed specifically for high-leverage (50-75x) perpetual trading on KCEX exchange.

## What Makes This Different

This is **NOT** your typical Smart Money Concepts (SMC) or liquidity sweep system. Instead of relying on generic equal highs/lows, this system uses **actual liquidation data** from exchanges to identify where real liquidation clusters exist and trades the reversal when price hits these zones.

## Features

- **Liquidation Heatmap Integration**: Fetches real-time liquidation data from Coinglass API
- **Smart Entry Signals**: Multiple confirmation filters (volume spikes, RSI, candlestick patterns)
- **Risk Management**: Position sizing calculator, liquidation price warnings, stop-loss management
- **Backtesting Framework**: Test strategies on historical data with realistic leverage simulation
- **Production Ready**: Modular code structure, comprehensive logging, error handling

## System Requirements

- Python 3.8 or higher
- Internet connection (for API access)
- KCEX trading account (for live trading)
- Coinglass API key (optional, for liquidation data)

## Installation

### 1. Clone or Navigate to Project Directory

```bash
cd liquidation_hunter
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Your Settings

Edit `config.py` to customize:

- **Account Settings**: Balance, position sizes, leverage
- **Risk Parameters**: Stop-loss percentage, daily loss limits
- **API Keys**: Coinglass API key (for liquidation data)
- **Strategy Parameters**: Confirmation filters, take profit levels

**Important settings to configure:**

```python
ACCOUNT_BALANCE = 100.0              # Your account balance in USD
MIN_POSITION_SIZE = 1.0              # Minimum position size
MAX_POSITION_SIZE = 4.0              # Maximum position size
DEFAULT_LEVERAGE = 60                # Default leverage (50-75x range)
STOP_LOSS_PERCENT = 1.0              # Stop loss percentage (tight for high leverage)
```

## Usage

The system provides a command-line interface with three main commands:

### 1. Backtest the Strategy

Run a backtest to see how the strategy performs on historical data:

```bash
python main.py backtest -s BTCUSDT -t 5m -d 30 --save
```

**Options:**
- `-s, --symbol`: Trading pair (default: BTCUSDT)
- `-t, --timeframe`: Candle timeframe (5m, 15m, 1h, etc.)
- `-d, --days`: Number of days to backtest (default: 30)
- `-l, --leverage`: Leverage to use (default: from config)
- `-b, --balance`: Initial balance (default: from config)
- `--save`: Save results to file

**Example output:**
```
📊 BACKTEST RESULTS
═══════════════════════════════════════════════════════════
🔍 SUMMARY:
  Symbol:          BTCUSDT
  Timeframe:       5m
  Period:          2024-12-09 to 2025-01-08
  Initial Balance: $100.00
  Final Balance:   $127.50
  Total P&L:       $27.50
  Return:          27.50%

📈 TRADES:
  Total Trades:    45
  Winners:         28 (62.2%)
  Losers:          17
  Liquidations:    2
  Stop Losses:     15

💰 PROFIT & LOSS:
  Average Win:     $2.15
  Average Loss:    -$1.80
  Largest Win:     $8.50
  Largest Loss:    -$4.20
  Profit Factor:   1.65

⚠️  RISK METRICS:
  Max Drawdown:    -$8.50 (-8.50%)
  Avg Leverage:    60.0x
  Avg Position:    $2.50
```

### 2. Scan for Trading Opportunities

Scan current market conditions for liquidation heatmap signals:

```bash
python main.py scan -s BTCUSDT ETHUSDT -t 5m -l 60
```

**Options:**
- `-s, --symbols`: List of symbols to scan (default: from config)
- `-t, --timeframe`: Timeframe to analyze
- `-l, --leverage`: Leverage for position sizing

**Example output:**
```
🔎 Analyzing BTCUSDT...
  Current Price: $45,230.00
  📍 Found 8 liquidation clusters

  🎯 TRADE SIGNAL FOUND!
  Side:            LONG
  Entry:           $45,230.00
  Cluster:         $45,200.00
  Volume:          $850,000
  Signal Strength: 85/100
  Reason:          Liquidation cluster at $45,200.00 ($850,000 volume) - volume_spike+rsi_oversold confirmed

  💼 POSITION SIZING:
  Position Size:   $2.50
  Margin:          $0.04
  Leverage:        60x
  Stop Loss:       $44,777.70
  Liquidation:     $44,475.83
  Risk/Reward:     2.15

  🎯 TAKE PROFIT LEVELS:
    TP1: $45,908.45 (1.5%, 50% size)
    TP2: $46,360.75 (2.5%, 30% size)
    TP3: $47,039.20 (4.0%, 20% size)
```

### 3. View Current Configuration

Display your current settings:

```bash
python main.py config
```

## Project Structure

```
liquidation_hunter/
├── config.py                    # Configuration settings
├── main.py                      # Main entry point / CLI
├── requirements.txt             # Python dependencies
├── README.md                    # This file
│
├── data/                        # Data fetching modules
│   ├── liquidation_data.py      # Coinglass API integration
│   └── price_data.py            # Price data (KCEX/Binance)
│
├── strategies/                  # Strategy implementations
│   └── liquidation_heatmap_strategy.py  # Main strategy logic
│
├── risk_management/             # Risk management
│   └── risk_calculator.py       # Position sizing, liquidation calcs
│
├── backtesting/                 # Backtesting framework
│   └── backtest_engine.py       # Backtest engine
│
├── utils/                       # Utility functions
│
├── logs/                        # Log files
│   └── trading_system.log       # System logs
│
└── outputs/                     # Output files
    ├── backtests/               # Backtest results
    ├── trades/                  # Trade logs
    └── charts/                  # Generated charts
```

## How the Strategy Works

### 1. Liquidation Cluster Detection

The system fetches liquidation heatmap data from Coinglass API and identifies significant liquidation clusters:

- Minimum volume threshold: $100,000 (configurable)
- Tracks both long and short liquidations
- Calculates distance from current price

### 2. Entry Signal Generation

A trade signal is generated when:

1. **Price enters liquidation zone** (within 0.5% of cluster)
2. **Volume confirmation** (1.5x average volume spike)
3. **RSI confirmation** (oversold <30 for longs, overbought >70 for shorts)
4. **Candlestick pattern** (hammer, engulfing, pin bar, etc.)

### 3. Position Management

- **Stop Loss**: Tight 1% stop (critical for high leverage)
- **Take Profit**: Multiple levels (1.5%, 2.5%, 4.0%)
- **Partial Exits**: Take profits at different levels to lock in gains
- **Liquidation Monitoring**: Constant tracking to avoid liquidation

### 4. Risk Management

- **Position Sizing**: Based on account balance and risk tolerance
- **Leverage Control**: 50-75x range with proper margin calculation
- **Daily Loss Limits**: Stop trading when daily loss limit hit
- **Max Concurrent Positions**: Limit exposure (default: 2 positions)

## Configuration Guide

### Account Settings

```python
ACCOUNT_BALANCE = 100.0           # Your total account size
MAX_DAILY_LOSS_PERCENT = 10.0     # Maximum daily loss (10% = $10)
```

### Position Settings

```python
MIN_POSITION_SIZE = 1.0           # Minimum position size in USD
MAX_POSITION_SIZE = 4.0           # Maximum position size in USD
DEFAULT_POSITION_SIZE = 2.0       # Default position size
```

### Leverage Settings

```python
MIN_LEVERAGE = 50                 # Minimum leverage
MAX_LEVERAGE = 75                 # Maximum leverage
DEFAULT_LEVERAGE = 60             # Default for backtesting
```

**⚠️ Warning**: At 75x leverage, a 1.33% price move against you = liquidation!

### Strategy Parameters

```python
# Liquidation clusters
MIN_LIQUIDATION_VOLUME = 100000   # Minimum cluster size ($100k)
LIQUIDATION_ZONE_THRESHOLD = 0.5  # Distance threshold (0.5%)

# Confirmations
REQUIRE_VOLUME_SPIKE = True       # Require volume spike
VOLUME_SPIKE_MULTIPLIER = 1.5     # Volume threshold (1.5x average)
USE_RSI_FILTER = True             # Use RSI filter
RSI_OVERSOLD = 30                 # RSI oversold level
RSI_OVERBOUGHT = 70               # RSI overbought level

# Risk management
STOP_LOSS_PERCENT = 1.0           # Stop loss (1%)
USE_TRAILING_STOP = True          # Enable trailing stop
TRAILING_STOP_PERCENT = 0.5       # Trailing stop (0.5%)
```

### API Configuration

You'll need to add your Coinglass API key for liquidation data:

```python
COINGLASS_API_KEY = "your_api_key_here"
```

Get your API key from: https://www.coinglass.com/

## Testing Components

Each module can be tested independently:

### Test Price Data Fetcher

```bash
cd liquidation_hunter/data
python price_data.py
```

### Test Liquidation Data Fetcher

```bash
cd liquidation_hunter/data
python liquidation_data.py
```

### Test Risk Calculator

```bash
cd liquidation_hunter/risk_management
python risk_calculator.py
```

### Test Strategy Logic

```bash
cd liquidation_hunter/strategies
python liquidation_heatmap_strategy.py
```

## Backtesting Best Practices

1. **Start with longer lookbacks**: Test 30-60 days minimum
2. **Use realistic parameters**: Match your actual account size and leverage
3. **Test multiple timeframes**: 5m and 15m charts
4. **Test multiple pairs**: BTC, ETH, and other liquid pairs
5. **Consider market conditions**: Bull markets vs bear markets perform differently

## Risk Warnings

⚠️ **IMPORTANT SAFETY NOTICES**:

1. **High Leverage Risk**: At 50-75x leverage, small price movements can liquidate your position
2. **Liquidation Distance**: At 75x, you're liquidated at ~1.33% move against you
3. **Use Tight Stops**: The 1% stop loss is CRITICAL - never disable it
4. **Start Small**: Begin with minimum position sizes ($1-2)
5. **Respect Daily Limits**: Stop trading when you hit daily loss limit
6. **Test First**: Always backtest before live trading
7. **Market Gaps**: Crypto markets can gap - stops may not fill at exact prices
8. **API Reliability**: Ensure stable internet connection and API access

## Troubleshooting

### "No liquidation data available"

- Check your Coinglass API key in `config.py`
- Verify API key has correct permissions
- System will use simulated clusters as fallback for backtesting

### "Failed to fetch price data"

- Check internet connection
- Binance API may be rate-limited (wait a minute and retry)
- Try different exchange in config

### "Insufficient balance"

- Your position size exceeds available margin
- Reduce position size or leverage in config
- Check ACCOUNT_BALANCE setting

### "Configuration errors"

- Review config.py for invalid settings
- Check that MIN values are less than MAX values
- Ensure leverage is reasonable (<125x)

## Advanced Usage

### Running Continuous Scanning

You can set up a cron job or loop to continuously scan for opportunities:

```bash
# Scan every 5 minutes
while true; do
  python main.py scan -s BTCUSDT ETHUSDT
  sleep 300
done
```

### Saving Backtest Results

All backtest results can be saved to JSON files for analysis:

```bash
python main.py backtest -s BTCUSDT -t 5m -d 30 --save
```

Results are saved to `outputs/backtests/` with timestamp.

## Future Enhancements

Potential additions to the system:

- [ ] Live trading execution via KCEX API
- [ ] Telegram notifications for signals
- [ ] Web dashboard for monitoring
- [ ] Machine learning for signal optimization
- [ ] Multi-exchange support
- [ ] Advanced chart visualization
- [ ] Paper trading mode

## Support

For issues, questions, or contributions:

1. Check the troubleshooting section above
2. Review configuration settings in `config.py`
3. Check logs in `logs/trading_system.log`
4. Test individual components to isolate issues

## Disclaimer

This software is for educational purposes only. Trading cryptocurrency, especially with high leverage, carries significant risk. Never trade with money you cannot afford to lose. Past performance does not guarantee future results. The developers assume no responsibility for financial losses incurred through use of this software.

**USE AT YOUR OWN RISK**

## License

This project is provided as-is for personal use. Always test thoroughly before using with real funds.

---

**Happy Trading! 🚀** (But please trade responsibly! 🛡️)
