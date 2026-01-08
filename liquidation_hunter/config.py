"""
Configuration file for Liquidation Hunter Trading System
Customize these parameters based on your trading preferences
"""

# ==================== EXCHANGE SETTINGS ====================
EXCHANGE = "BLOFIN"  # Primary exchange
FALLBACK_EXCHANGE = "Binance"  # For price data if BLOFIN API unavailable

# ==================== ACCOUNT SETTINGS ====================
ACCOUNT_BALANCE = 100.0  # Total account balance in USD
MAX_DAILY_LOSS_PERCENT = 10.0  # Maximum daily loss percentage (10% = $10)
MAX_DAILY_LOSS_USD = ACCOUNT_BALANCE * (MAX_DAILY_LOSS_PERCENT / 100)

# ==================== POSITION SETTINGS ====================
MIN_POSITION_SIZE = 1.0  # Minimum position size in USD
MAX_POSITION_SIZE = 4.0  # Maximum position size in USD
DEFAULT_POSITION_SIZE = 2.0  # Default position size in USD

MIN_LEVERAGE = 50  # Minimum leverage
MAX_LEVERAGE = 75  # Maximum leverage
DEFAULT_LEVERAGE = 60  # Default leverage for backtesting

# ==================== TRADING PAIRS ====================
TRADING_PAIRS = [
    "BTCUSDT",
    "ETHUSDT"
]

# ==================== TIMEFRAMES ====================
TIMEFRAMES = ["5m", "15m"]  # 5-minute and 15-minute charts
DEFAULT_TIMEFRAME = "5m"

# ==================== LIQUIDATION HEATMAP SETTINGS ====================
# Minimum liquidation volume to consider a zone significant (in USD)
MIN_LIQUIDATION_VOLUME = 100000  # $100k minimum cluster

# Distance threshold to consider price "near" a liquidation zone (in percentage)
LIQUIDATION_ZONE_THRESHOLD = 0.5  # 0.5% distance from liquidation cluster

# How many liquidation zones to track simultaneously
MAX_TRACKED_ZONES = 10

# Refresh rate for liquidation data (in seconds)
LIQUIDATION_DATA_REFRESH_RATE = 60  # Update every 60 seconds

# ==================== STRATEGY PARAMETERS ====================
# Reversal confirmation indicators
REQUIRE_VOLUME_SPIKE = True  # Require volume spike for entry
VOLUME_SPIKE_MULTIPLIER = 1.5  # Volume must be 1.5x average

REQUIRE_CANDLESTICK_PATTERN = True  # Require bullish/bearish pattern
VALID_REVERSAL_PATTERNS = [
    "hammer",
    "shooting_star",
    "engulfing",
    "pin_bar"
]

# Momentum confirmation
USE_RSI_FILTER = True
RSI_OVERSOLD = 30  # Enter long when RSI < 30 at liquidation zone
RSI_OVERBOUGHT = 70  # Enter short when RSI > 70 at liquidation zone

# ==================== RISK MANAGEMENT ====================
# Stop loss as percentage of entry price
STOP_LOSS_PERCENT = 1.0  # 1% stop loss (tight due to high leverage)

# Take profit levels (multiple targets)
TAKE_PROFIT_LEVELS = [
    {"percent": 1.5, "size": 0.5},  # Take 50% profit at 1.5%
    {"percent": 2.5, "size": 0.3},  # Take 30% profit at 2.5%
    {"percent": 4.0, "size": 0.2},  # Take 20% profit at 4.0%
]

# Trailing stop after first TP hit
USE_TRAILING_STOP = True
TRAILING_STOP_PERCENT = 0.5  # 0.5% trailing stop

# Maximum positions open simultaneously
MAX_CONCURRENT_POSITIONS = 2

# ==================== BACKTESTING SETTINGS ====================
BACKTEST_DAYS = 30  # Number of days to backtest
BACKTEST_START_DATE = None  # Auto-calculate based on BACKTEST_DAYS
BACKTEST_END_DATE = None  # Use current date

# Trading fees (maker/taker)
MAKER_FEE = 0.0002  # 0.02%
TAKER_FEE = 0.0006  # 0.06%

# Slippage simulation
SLIPPAGE_PERCENT = 0.1  # 0.1% slippage

# ==================== API SETTINGS ====================
# Coinglass API for liquidation data
COINGLASS_API_KEY = ""  # Add your Coinglass API key here (or use config_local.py)
COINGLASS_BASE_URL = "https://open-api.coinglass.com/public/v2"

# Binance API (for price data fallback)
BINANCE_API_KEY = ""  # Optional: Add if you need authenticated endpoints
BINANCE_SECRET_KEY = ""
BINANCE_BASE_URL = "https://api.binance.com"

# BLOFIN API (if available)
BLOFIN_API_KEY = ""  # Add your BLOFIN API key if available
BLOFIN_SECRET_KEY = ""
BLOFIN_BASE_URL = "https://openapi.blofin.com"  # BLOFIN API URL

# ==================== LOGGING SETTINGS ====================
LOG_LEVEL = "INFO"  # DEBUG, INFO, WARNING, ERROR
LOG_FILE = "logs/trading_system.log"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

# ==================== OUTPUT SETTINGS ====================
SAVE_BACKTEST_RESULTS = True
BACKTEST_OUTPUT_DIR = "outputs/backtests"
TRADE_LOG_OUTPUT_DIR = "outputs/trades"

# Save charts and visualizations
SAVE_CHARTS = True
CHART_OUTPUT_DIR = "outputs/charts"

# ==================== ALERT SETTINGS ====================
ENABLE_ALERTS = False  # Enable/disable trading alerts
ALERT_METHOD = "console"  # console, email, telegram (implement as needed)

# ==================== VALIDATION ====================
def validate_config():
    """Validate configuration parameters"""
    errors = []

    if MIN_POSITION_SIZE > MAX_POSITION_SIZE:
        errors.append("MIN_POSITION_SIZE cannot be greater than MAX_POSITION_SIZE")

    if MIN_LEVERAGE > MAX_LEVERAGE:
        errors.append("MIN_LEVERAGE cannot be greater than MAX_LEVERAGE")

    if MAX_LEVERAGE > 125:
        errors.append("MAX_LEVERAGE exceeds safe limits (>125x)")

    if STOP_LOSS_PERCENT >= 100 / DEFAULT_LEVERAGE:
        errors.append(f"STOP_LOSS_PERCENT too large for {DEFAULT_LEVERAGE}x leverage")

    if MAX_DAILY_LOSS_PERCENT > 50:
        errors.append("MAX_DAILY_LOSS_PERCENT exceeds 50% - too risky")

    if not TRADING_PAIRS:
        errors.append("TRADING_PAIRS cannot be empty")

    if errors:
        raise ValueError("Configuration errors:\n" + "\n".join(f"  - {e}" for e in errors))

    return True

# Validate on import
try:
    validate_config()
except ValueError as e:
    print(f"WARNING: {e}")

# Import local configuration overrides (API keys, etc.)
# This allows you to keep sensitive data out of version control
try:
    from config_local import *
except ImportError:
    pass  # config_local.py is optional
