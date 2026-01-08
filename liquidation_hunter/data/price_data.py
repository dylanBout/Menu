"""
Price Data Fetcher
Fetches historical and real-time price data from exchanges
Primary: KCEX, Fallback: Binance
"""

import requests
import pandas as pd
import logging
from datetime import datetime, timedelta
from typing import Optional, List
import time
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config

logging.basicConfig(level=getattr(logging, config.LOG_LEVEL))
logger = logging.getLogger(__name__)


class PriceDataFetcher:
    """Fetches price data from exchanges (KCEX with Binance fallback)"""

    def __init__(self, exchange: str = None):
        """
        Initialize price data fetcher

        Args:
            exchange: Exchange to use ('KCEX' or 'Binance')
        """
        self.exchange = exchange or config.EXCHANGE
        self.session = requests.Session()

        # Set base URL based on exchange
        if self.exchange.upper() == "KCEX":
            self.base_url = config.KCEX_BASE_URL
            self.use_binance_fallback = True
        else:
            self.base_url = config.BINANCE_BASE_URL
            self.use_binance_fallback = False

        logger.info(f"PriceDataFetcher initialized for {self.exchange}")

    def get_current_price(self, symbol: str) -> Optional[float]:
        """
        Get current market price for a symbol

        Args:
            symbol: Trading pair (e.g., 'BTCUSDT')

        Returns:
            Current price as float, or None if error
        """
        try:
            # Try primary exchange first
            price = self._fetch_current_price(symbol, self.base_url)

            if price is None and self.use_binance_fallback:
                logger.warning(f"Falling back to Binance for {symbol} price")
                price = self._fetch_current_price(symbol, config.BINANCE_BASE_URL)

            if price:
                logger.debug(f"{symbol} current price: ${price:,.2f}")
                return price

        except Exception as e:
            logger.error(f"Error fetching current price for {symbol}: {e}")

        return None

    def _fetch_current_price(self, symbol: str, base_url: str) -> Optional[float]:
        """Fetch current price from specific exchange"""
        try:
            endpoint = f"{base_url}/api/v3/ticker/price"
            params = {"symbol": symbol}

            response = self.session.get(endpoint, params=params, timeout=5)

            if response.status_code == 200:
                data = response.json()
                return float(data.get("price", 0))
            else:
                logger.debug(f"Price fetch failed: {response.status_code}")

        except Exception as e:
            logger.debug(f"Error in _fetch_current_price: {e}")

        return None

    def get_historical_klines(
        self,
        symbol: str,
        interval: str,
        start_time: datetime = None,
        end_time: datetime = None,
        limit: int = 1000
    ) -> Optional[pd.DataFrame]:
        """
        Get historical candlestick data

        Args:
            symbol: Trading pair
            interval: Timeframe (1m, 5m, 15m, 1h, 4h, 1d)
            start_time: Start datetime
            end_time: End datetime
            limit: Maximum number of candles

        Returns:
            DataFrame with OHLCV data
        """
        try:
            # Convert interval format
            interval_map = {
                "5m": "5m",
                "15m": "15m",
                "1h": "1h",
                "4h": "4h",
                "1d": "1d"
            }
            interval = interval_map.get(interval, interval)

            # Try primary exchange
            df = self._fetch_klines(
                symbol, interval, start_time, end_time, limit, self.base_url
            )

            # Fallback to Binance if needed
            if df is None and self.use_binance_fallback:
                logger.warning(f"Falling back to Binance for {symbol} klines")
                df = self._fetch_klines(
                    symbol, interval, start_time, end_time, limit, config.BINANCE_BASE_URL
                )

            if df is not None and not df.empty:
                logger.info(f"Fetched {len(df)} candles for {symbol} {interval}")
                return df

        except Exception as e:
            logger.error(f"Error fetching historical klines: {e}")

        return None

    def _fetch_klines(
        self,
        symbol: str,
        interval: str,
        start_time: Optional[datetime],
        end_time: Optional[datetime],
        limit: int,
        base_url: str
    ) -> Optional[pd.DataFrame]:
        """Fetch klines from specific exchange"""
        try:
            endpoint = f"{base_url}/api/v3/klines"
            params = {
                "symbol": symbol,
                "interval": interval,
                "limit": limit
            }

            # Add time parameters if provided
            if start_time:
                params["startTime"] = int(start_time.timestamp() * 1000)
            if end_time:
                params["endTime"] = int(end_time.timestamp() * 1000)

            response = self.session.get(endpoint, params=params, timeout=15)

            if response.status_code == 200:
                data = response.json()
                return self._parse_klines(data)
            else:
                logger.debug(f"Klines fetch failed: {response.status_code}")

        except Exception as e:
            logger.debug(f"Error in _fetch_klines: {e}")

        return None

    def _parse_klines(self, data: List) -> pd.DataFrame:
        """Parse kline data into DataFrame"""
        if not data:
            return pd.DataFrame()

        df = pd.DataFrame(data, columns=[
            "timestamp", "open", "high", "low", "close", "volume",
            "close_time", "quote_volume", "trades", "taker_buy_base",
            "taker_buy_quote", "ignore"
        ])

        # Convert types
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
        df["close_time"] = pd.to_datetime(df["close_time"], unit="ms")

        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        # Set timestamp as index
        df.set_index("timestamp", inplace=True)

        # Keep only essential columns
        df = df[["open", "high", "low", "close", "volume"]]

        return df

    def get_recent_trades(self, symbol: str, limit: int = 100) -> Optional[pd.DataFrame]:
        """
        Get recent trades for a symbol

        Args:
            symbol: Trading pair
            limit: Number of trades to fetch

        Returns:
            DataFrame with recent trades
        """
        try:
            endpoint = f"{self.base_url}/api/v3/trades"
            params = {"symbol": symbol, "limit": limit}

            response = self.session.get(endpoint, params=params, timeout=5)

            if response.status_code == 200:
                data = response.json()
                df = pd.DataFrame(data)

                if not df.empty:
                    df["time"] = pd.to_datetime(df["time"], unit="ms")
                    df["price"] = pd.to_numeric(df["price"])
                    df["qty"] = pd.to_numeric(df["qty"])
                    return df

        except Exception as e:
            logger.error(f"Error fetching recent trades: {e}")

        return None

    def get_24h_stats(self, symbol: str) -> Optional[dict]:
        """
        Get 24-hour statistics for a symbol

        Args:
            symbol: Trading pair

        Returns:
            Dict with 24h stats (volume, price change, etc.)
        """
        try:
            endpoint = f"{self.base_url}/api/v3/ticker/24hr"
            params = {"symbol": symbol}

            response = self.session.get(endpoint, params=params, timeout=5)

            if response.status_code == 200:
                data = response.json()
                return {
                    "symbol": data.get("symbol"),
                    "price_change": float(data.get("priceChange", 0)),
                    "price_change_percent": float(data.get("priceChangePercent", 0)),
                    "high_24h": float(data.get("highPrice", 0)),
                    "low_24h": float(data.get("lowPrice", 0)),
                    "volume_24h": float(data.get("volume", 0)),
                    "quote_volume_24h": float(data.get("quoteVolume", 0)),
                }

        except Exception as e:
            logger.error(f"Error fetching 24h stats: {e}")

        return None

    def get_orderbook(self, symbol: str, limit: int = 20) -> Optional[dict]:
        """
        Get current orderbook (bid/ask levels)

        Args:
            symbol: Trading pair
            limit: Depth of orderbook

        Returns:
            Dict with bids and asks
        """
        try:
            endpoint = f"{self.base_url}/api/v3/depth"
            params = {"symbol": symbol, "limit": limit}

            response = self.session.get(endpoint, params=params, timeout=5)

            if response.status_code == 200:
                data = response.json()
                return {
                    "bids": [[float(p), float(q)] for p, q in data.get("bids", [])],
                    "asks": [[float(p), float(q)] for p, q in data.get("asks", [])],
                    "timestamp": datetime.now()
                }

        except Exception as e:
            logger.error(f"Error fetching orderbook: {e}")

        return None

    def calculate_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate technical indicators on price data

        Args:
            df: DataFrame with OHLCV data

        Returns:
            DataFrame with added indicators
        """
        if df is None or df.empty:
            return df

        # RSI (Relative Strength Index)
        df["rsi"] = self._calculate_rsi(df["close"], period=14)

        # Volume average
        df["volume_avg"] = df["volume"].rolling(window=20).mean()

        # Volume spike detection
        df["volume_spike"] = df["volume"] > (df["volume_avg"] * config.VOLUME_SPIKE_MULTIPLIER)

        # Simple moving averages
        df["sma_20"] = df["close"].rolling(window=20).mean()
        df["sma_50"] = df["close"].rolling(window=50).mean()

        return df

    def _calculate_rsi(self, prices: pd.Series, period: int = 14) -> pd.Series:
        """Calculate RSI indicator"""
        delta = prices.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()

        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))

        return rsi


# Convenience function
def get_price_fetcher(exchange: str = None) -> PriceDataFetcher:
    """Get a configured price data fetcher instance"""
    return PriceDataFetcher(exchange)


if __name__ == "__main__":
    # Test the price data fetcher
    print("Testing Price Data Fetcher...\n")

    fetcher = get_price_fetcher("Binance")  # Use Binance for testing

    # Test current price
    symbol = "BTCUSDT"
    print(f"Fetching current price for {symbol}...")
    price = fetcher.get_current_price(symbol)
    print(f"Current price: ${price:,.2f}\n")

    # Test historical data
    print(f"Fetching historical 5m data for {symbol}...")
    end_time = datetime.now()
    start_time = end_time - timedelta(days=1)
    df = fetcher.get_historical_klines(symbol, "5m", start_time, end_time, limit=100)

    if df is not None:
        print(f"Fetched {len(df)} candles")
        print(df.head())
        print("\nWith indicators:")
        df = fetcher.calculate_indicators(df)
        print(df.tail())
    else:
        print("Failed to fetch historical data")

    # Test 24h stats
    print(f"\n24h statistics for {symbol}:")
    stats = fetcher.get_24h_stats(symbol)
    if stats:
        for key, value in stats.items():
            print(f"  {key}: {value}")
