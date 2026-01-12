"""
Liquidation Data Fetcher
Fetches real-time and historical liquidation data from Coinglass API
Falls back to Binance FREE liquidation data if Coinglass unavailable
"""

import requests
import pandas as pd
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import time
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config

logging.basicConfig(level=getattr(logging, config.LOG_LEVEL))
logger = logging.getLogger(__name__)

# Try to import Binance liquidation fetcher (FREE fallback)
try:
    from data.binance_liquidations import BinanceLiquidationFetcher
    BINANCE_AVAILABLE = True
except ImportError:
    BINANCE_AVAILABLE = False
    logger.warning("Binance liquidation fetcher not available")


class LiquidationDataFetcher:
    """Fetches liquidation heatmap data from Coinglass API"""

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize the liquidation data fetcher

        Args:
            api_key: Coinglass API key (optional for some endpoints)
        """
        self.api_key = api_key or config.COINGLASS_API_KEY
        self.base_url = config.COINGLASS_BASE_URL
        self.session = requests.Session()

        if self.api_key:
            self.session.headers.update({"CG-API-KEY": self.api_key})

        # Initialize Binance fallback (FREE)
        self.binance_fetcher = None
        if BINANCE_AVAILABLE:
            try:
                self.binance_fetcher = BinanceLiquidationFetcher()
                logger.info("LiquidationDataFetcher initialized (with Binance FREE fallback)")
            except Exception as e:
                logger.warning(f"Binance fallback init failed: {e}")
        else:
            logger.info("LiquidationDataFetcher initialized (Coinglass only)")

    def get_liquidation_heatmap(
        self,
        symbol: str,
        timeframe: str = "1h"
    ) -> Optional[pd.DataFrame]:
        """
        Get liquidation heatmap data for a symbol

        Args:
            symbol: Trading pair (e.g., 'BTCUSDT')
            timeframe: Timeframe for aggregation

        Returns:
            DataFrame with liquidation levels and volumes
        """
        try:
            # Clean symbol format (remove 'USDT' for Coinglass)
            coin = symbol.replace("USDT", "").replace("BUSD", "")

            endpoint = f"{self.base_url}/liquidation_heatmap"
            params = {
                "symbol": coin,
                "interval": timeframe
            }

            logger.debug(f"Fetching liquidation heatmap for {symbol}")
            response = self.session.get(endpoint, params=params, timeout=10)

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return self._parse_heatmap_data(data.get("data", []))
                else:
                    logger.warning(f"API returned success=false: {data.get('msg')}")
            else:
                logger.error(f"API error {response.status_code}: {response.text}")

        except requests.exceptions.RequestException as e:
            logger.error(f"Request failed for {symbol}: {e}")
        except Exception as e:
            logger.error(f"Unexpected error fetching heatmap: {e}")

        return None

    def get_liquidation_clusters(
        self,
        symbol: str,
        current_price: float,
        min_volume: float = None
    ) -> List[Dict]:
        """
        Get significant liquidation clusters near current price

        Args:
            symbol: Trading pair
            current_price: Current market price
            min_volume: Minimum volume to consider significant

        Returns:
            List of liquidation clusters with price levels and volumes
        """
        min_volume = min_volume or config.MIN_LIQUIDATION_VOLUME
        heatmap_df = self.get_liquidation_heatmap(symbol)

        # Try Binance FREE fallback if Coinglass fails
        if (heatmap_df is None or heatmap_df.empty) and self.binance_fetcher:
            logger.info(f"Coinglass unavailable - using Binance FREE liquidations for {symbol}")
            try:
                binance_clusters = self.binance_fetcher.calculate_liquidation_clusters(
                    symbol, current_price, min_cluster_value=min_volume
                )
                if binance_clusters:
                    logger.info(f"Found {len(binance_clusters)} clusters from Binance FREE data")
                    return binance_clusters
            except Exception as e:
                logger.warning(f"Binance fallback failed: {e}")

        if heatmap_df is None or heatmap_df.empty:
            logger.warning(f"No liquidation data available for {symbol}")
            return []

        # Filter significant clusters
        significant = heatmap_df[heatmap_df["volume_usd"] >= min_volume].copy()

        # Calculate distance from current price
        significant["distance_percent"] = (
            abs(significant["price"] - current_price) / current_price * 100
        )

        # Sort by volume (largest first)
        significant = significant.sort_values("volume_usd", ascending=False)

        # Convert to list of dicts
        clusters = []
        for _, row in significant.iterrows():
            clusters.append({
                "price": row["price"],
                "volume_usd": row["volume_usd"],
                "side": row["side"],  # long or short liquidations
                "distance_percent": row["distance_percent"],
                "timestamp": row.get("timestamp", datetime.now())
            })

        logger.info(f"Found {len(clusters)} significant liquidation clusters for {symbol}")
        return clusters

    def get_nearest_liquidation_zone(
        self,
        symbol: str,
        current_price: float,
        direction: str = "both"
    ) -> Optional[Dict]:
        """
        Get the nearest significant liquidation zone

        Args:
            symbol: Trading pair
            current_price: Current market price
            direction: 'above', 'below', or 'both'

        Returns:
            Dict with nearest liquidation zone info
        """
        clusters = self.get_liquidation_clusters(symbol, current_price)

        if not clusters:
            return None

        # Filter by direction
        if direction == "above":
            clusters = [c for c in clusters if c["price"] > current_price]
        elif direction == "below":
            clusters = [c for c in clusters if c["price"] < current_price]

        if not clusters:
            return None

        # Return closest cluster
        nearest = min(clusters, key=lambda x: x["distance_percent"])
        logger.info(
            f"Nearest liquidation zone: ${nearest['price']:.2f} "
            f"({nearest['distance_percent']:.2f}% away, "
            f"${nearest['volume_usd']:,.0f} volume)"
        )
        return nearest

    def is_price_in_liquidation_zone(
        self,
        symbol: str,
        current_price: float,
        threshold_percent: float = None
    ) -> Tuple[bool, Optional[Dict]]:
        """
        Check if current price is in a liquidation zone

        Args:
            symbol: Trading pair
            current_price: Current market price
            threshold_percent: Distance threshold (default from config)

        Returns:
            Tuple of (is_in_zone, zone_info)
        """
        threshold_percent = threshold_percent or config.LIQUIDATION_ZONE_THRESHOLD
        clusters = self.get_liquidation_clusters(symbol, current_price)

        for cluster in clusters:
            if cluster["distance_percent"] <= threshold_percent:
                logger.info(f"Price in liquidation zone: {cluster}")
                return True, cluster

        return False, None

    def get_historical_liquidations(
        self,
        symbol: str,
        start_time: datetime,
        end_time: datetime = None
    ) -> Optional[pd.DataFrame]:
        """
        Get historical liquidation data for backtesting

        Args:
            symbol: Trading pair
            start_time: Start datetime
            end_time: End datetime (default: now)

        Returns:
            DataFrame with historical liquidations
        """
        end_time = end_time or datetime.now()
        coin = symbol.replace("USDT", "").replace("BUSD", "")

        try:
            endpoint = f"{self.base_url}/liquidation_history"
            params = {
                "symbol": coin,
                "start_time": int(start_time.timestamp() * 1000),
                "end_time": int(end_time.timestamp() * 1000)
            }

            logger.debug(f"Fetching historical liquidations for {symbol}")
            response = self.session.get(endpoint, params=params, timeout=15)

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return self._parse_liquidation_history(data.get("data", []))
            else:
                logger.error(f"Historical data error {response.status_code}")

        except Exception as e:
            logger.error(f"Error fetching historical liquidations: {e}")

        return None

    def _parse_heatmap_data(self, data: List[Dict]) -> pd.DataFrame:
        """Parse heatmap API response into DataFrame"""
        if not data:
            return pd.DataFrame()

        df = pd.DataFrame(data)

        # Standardize column names
        column_mapping = {
            "price": "price",
            "vol": "volume_usd",
            "side": "side",
            "time": "timestamp"
        }

        # Rename columns if they exist
        for old_name, new_name in column_mapping.items():
            if old_name in df.columns:
                df.rename(columns={old_name: new_name}, inplace=True)

        # Ensure required columns exist
        if "price" not in df.columns or "volume_usd" not in df.columns:
            logger.warning("Heatmap data missing required columns")
            return pd.DataFrame()

        # Add side if not present (assume both)
        if "side" not in df.columns:
            df["side"] = "both"

        # Convert timestamp if present
        if "timestamp" in df.columns:
            df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")

        return df

    def _parse_liquidation_history(self, data: List[Dict]) -> pd.DataFrame:
        """Parse liquidation history into DataFrame"""
        if not data:
            return pd.DataFrame()

        df = pd.DataFrame(data)

        # Convert timestamp
        if "time" in df.columns:
            df["timestamp"] = pd.to_datetime(df["time"], unit="ms")
            df.drop("time", axis=1, inplace=True)

        return df

    def get_liquidation_levels_for_backtest(
        self,
        symbol: str,
        timeframe: str,
        lookback_days: int = 30
    ) -> pd.DataFrame:
        """
        Generate liquidation levels for backtesting

        Args:
            symbol: Trading pair
            timeframe: Candle timeframe
            lookback_days: Days to look back

        Returns:
            DataFrame with liquidation levels indexed by time
        """
        end_time = datetime.now()
        start_time = end_time - timedelta(days=lookback_days)

        # Try to get historical data
        hist_liq = self.get_historical_liquidations(symbol, start_time, end_time)

        if hist_liq is not None and not hist_liq.empty:
            return hist_liq

        # Fallback: generate synthetic liquidation zones from current heatmap
        logger.warning("Using current heatmap as proxy for historical data")
        heatmap = self.get_liquidation_heatmap(symbol, timeframe)

        if heatmap is None or heatmap.empty:
            return pd.DataFrame()

        # Replicate heatmap across time range for backtesting
        # This is a fallback when historical data is unavailable
        return heatmap


# Convenience function
def get_liquidation_fetcher() -> LiquidationDataFetcher:
    """Get a configured liquidation data fetcher instance"""
    return LiquidationDataFetcher()


if __name__ == "__main__":
    # Test the liquidation data fetcher
    print("Testing Liquidation Data Fetcher...\n")

    fetcher = get_liquidation_fetcher()

    # Test with BTC
    symbol = "BTCUSDT"
    print(f"Fetching liquidation data for {symbol}...")

    # Get heatmap
    heatmap = fetcher.get_liquidation_heatmap(symbol)
    if heatmap is not None:
        print(f"\nHeatmap data shape: {heatmap.shape}")
        print(heatmap.head())
    else:
        print("\nNo heatmap data available (may need API key)")

    # Simulate checking for zones
    current_price = 45000.0  # Example BTC price
    print(f"\nChecking for liquidation zones near ${current_price:,.0f}...")

    in_zone, zone_info = fetcher.is_price_in_liquidation_zone(symbol, current_price)
    print(f"In liquidation zone: {in_zone}")
    if zone_info:
        print(f"Zone info: {zone_info}")
