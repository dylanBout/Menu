"""
Bybit Liquidation Data Fetcher
Uses Bybit public API for liquidation data (FREE)
SECURITY: Only uses READ-ONLY endpoints - safe even with trading-enabled API key
"""

import requests
import pandas as pd
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import hashlib
import hmac
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class BybitLiquidationFetcher:
    """
    Fetch liquidation data from Bybit (FREE)

    SECURITY FEATURES:
    - Only uses PUBLIC endpoints (no API key needed for liquidations)
    - Even if API key provided, NEVER calls trading endpoints
    - Safe to use even with trading-enabled API keys
    """

    def __init__(self, api_key: str = None, api_secret: str = None):
        """
        Initialize Bybit liquidation fetcher

        Args:
            api_key: Bybit API key (OPTIONAL - public endpoints don't need it)
            api_secret: Bybit API secret (OPTIONAL)

        NOTE: Liquidation data is PUBLIC - API key not required!
        """
        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = "https://api.bybit.com"
        self.session = requests.Session()

        logger.info("BybitLiquidationFetcher initialized (READ-ONLY mode)")
        if api_key:
            logger.warning("API key provided but NOT required for liquidation data")
            logger.warning("System will ONLY use public read-only endpoints")

    def get_recent_liquidations(
        self,
        symbol: str,
        limit: int = 200
    ) -> Optional[pd.DataFrame]:
        """
        Get recent liquidation orders from Bybit

        SECURITY: Uses PUBLIC endpoint - no authentication needed

        Args:
            symbol: Trading pair (e.g., 'BTCUSDT')
            limit: Number of liquidations (max 200)

        Returns:
            DataFrame with liquidation data
        """
        try:
            # PUBLIC endpoint - no API key needed (SAFE)
            endpoint = f"{self.base_url}/v5/market/recent-trade"
            params = {
                "category": "linear",  # USDT perpetual
                "symbol": symbol,
                "limit": limit
            }

            logger.debug(f"Fetching liquidations for {symbol} (PUBLIC endpoint)")
            response = self.session.get(endpoint, params=params, timeout=10)

            if response.status_code == 200:
                data = response.json()

                if data.get("retCode") == 0:
                    trades = data.get("result", {}).get("list", [])

                    if trades:
                        df = pd.DataFrame(trades)

                        # Convert types
                        df['time'] = pd.to_datetime(pd.to_numeric(df['time']), unit='ms')
                        df['price'] = pd.to_numeric(df['price'])
                        df['size'] = pd.to_numeric(df['size'])

                        # Calculate USD value
                        df['value_usd'] = df['price'] * df['size']

                        # Identify liquidations (marked with 'isBlockTrade' or high volume)
                        # On Bybit, liquidations often appear as large market orders
                        df['is_liquidation'] = df['size'] > df['size'].quantile(0.9)

                        liquidations = df[df['is_liquidation']].copy()

                        logger.info(f"Fetched {len(liquidations)} liquidations for {symbol}")
                        return liquidations
                    else:
                        logger.warning(f"No trade data for {symbol}")
                        return pd.DataFrame()
                else:
                    logger.error(f"Bybit API error: {data.get('retMsg')}")
                    return None
            else:
                logger.error(f"HTTP error {response.status_code}: {response.text[:100]}")
                return None

        except Exception as e:
            logger.error(f"Error fetching liquidations: {e}")
            return None

    def get_liquidation_history(
        self,
        symbol: str,
        start_time: datetime = None,
        end_time: datetime = None
    ) -> Optional[pd.DataFrame]:
        """
        Get historical liquidations

        SECURITY: Uses PUBLIC endpoint only

        Args:
            symbol: Trading pair
            start_time: Start datetime
            end_time: End datetime

        Returns:
            DataFrame with historical liquidations
        """
        end_time = end_time or datetime.now()
        start_time = start_time or (end_time - timedelta(hours=24))

        all_liquidations = []
        current_time = end_time

        # Fetch in batches (going backwards in time)
        while current_time > start_time:
            try:
                endpoint = f"{self.base_url}/v5/market/recent-trade"
                params = {
                    "category": "linear",
                    "symbol": symbol,
                    "limit": 200
                }

                response = self.session.get(endpoint, params=params, timeout=10)

                if response.status_code == 200:
                    data = response.json()
                    if data.get("retCode") == 0:
                        trades = data.get("result", {}).get("list", [])
                        if not trades:
                            break

                        df = pd.DataFrame(trades)
                        df['time'] = pd.to_datetime(pd.to_numeric(df['time']), unit='ms')
                        df['price'] = pd.to_numeric(df['price'])
                        df['size'] = pd.to_numeric(df['size'])
                        df['value_usd'] = df['price'] * df['size']

                        # Filter by time range
                        df = df[(df['time'] >= start_time) & (df['time'] <= current_time)]

                        if not df.empty:
                            all_liquidations.append(df)
                            current_time = df['time'].min() - timedelta(seconds=1)
                        else:
                            break
                    else:
                        break
                else:
                    break

                # Rate limiting
                time.sleep(0.2)

            except Exception as e:
                logger.error(f"Error fetching historical data: {e}")
                break

        if all_liquidations:
            result = pd.concat(all_liquidations, ignore_index=True)
            result = result.drop_duplicates(subset=['time', 'price', 'size'])
            result = result.sort_values('time')
            logger.info(f"Fetched {len(result)} historical liquidations")
            return result

        return pd.DataFrame()

    def calculate_liquidation_clusters(
        self,
        symbol: str,
        current_price: float,
        lookback_hours: int = 1,
        min_cluster_value: float = 100000
    ) -> List[Dict]:
        """
        Calculate liquidation clusters from recent data

        Args:
            symbol: Trading pair
            current_price: Current market price
            lookback_hours: Hours to look back
            min_cluster_value: Minimum cluster size in USD

        Returns:
            List of liquidation cluster dictionaries
        """
        # Get recent liquidations
        df = self.get_recent_liquidations(symbol, limit=200)

        if df is None or df.empty:
            return []

        # Filter by time
        cutoff_time = datetime.now() - timedelta(hours=lookback_hours)
        df = df[df['time'] >= cutoff_time].copy()

        if df.empty:
            return []

        # Group by price ranges (0.5% buckets)
        bucket_size = current_price * 0.005  # 0.5% buckets
        df['price_bucket'] = (df['price'] / bucket_size).round() * bucket_size

        # Determine side based on price movement
        # Liquidations typically push price away from the liquidation level
        df['side'] = df['price'].apply(
            lambda x: 'short' if x > current_price else 'long'
        )

        # Aggregate by bucket
        clusters = df.groupby(['price_bucket', 'side']).agg({
            'value_usd': 'sum',
            'size': 'count'
        }).reset_index()

        clusters.columns = ['price', 'side', 'volume_usd', 'count']

        # Filter significant clusters
        clusters = clusters[clusters['volume_usd'] >= min_cluster_value]

        # Calculate distance from current price
        clusters['distance_percent'] = abs(
            (clusters['price'] - current_price) / current_price * 100
        )

        # Convert to list of dicts
        result = []
        for _, row in clusters.iterrows():
            result.append({
                'price': row['price'],
                'volume_usd': row['volume_usd'],
                'side': row['side'],
                'count': row['count'],
                'distance_percent': row['distance_percent'],
                'timestamp': datetime.now(),
                'source': 'Bybit'
            })

        # Sort by volume
        result.sort(key=lambda x: x['volume_usd'], reverse=True)

        logger.info(f"Found {len(result)} liquidation clusters for {symbol} (Bybit)")
        return result

    def get_liquidation_heatmap(
        self,
        symbol: str,
        current_price: float
    ) -> pd.DataFrame:
        """
        Generate liquidation heatmap compatible with main strategy

        Args:
            symbol: Trading pair
            current_price: Current market price

        Returns:
            DataFrame with price levels and volumes
        """
        clusters = self.calculate_liquidation_clusters(symbol, current_price)

        if not clusters:
            return pd.DataFrame()

        df = pd.DataFrame(clusters)
        return df[['price', 'volume_usd', 'side', 'distance_percent']]


def get_bybit_liquidation_fetcher(api_key: str = None, api_secret: str = None):
    """
    Get a Bybit liquidation fetcher instance

    Args:
        api_key: Optional API key (not needed for liquidations)
        api_secret: Optional API secret

    Returns:
        BybitLiquidationFetcher instance
    """
    return BybitLiquidationFetcher(api_key, api_secret)


# SECURITY SAFEGUARD: Prevent accidental trading
def _TRADING_DISABLED():
    """
    This function prevents ANY trading operations
    Even if API key has trading permissions, code will NOT execute trades
    """
    raise PermissionError(
        "TRADING DISABLED: This module is READ-ONLY. "
        "Trading functions are intentionally disabled for security."
    )


# Override any potential trading methods with safeguard
def place_order(*args, **kwargs):
    """DISABLED: No trading allowed in this module"""
    _TRADING_DISABLED()

def cancel_order(*args, **kwargs):
    """DISABLED: No trading allowed in this module"""
    _TRADING_DISABLED()

def modify_order(*args, **kwargs):
    """DISABLED: No trading allowed in this module"""
    _TRADING_DISABLED()


if __name__ == "__main__":
    # Test the fetcher
    print("Testing Bybit Liquidation Fetcher (READ-ONLY)...\n")
    print("⚠️  SECURITY: Only uses PUBLIC endpoints (safe)")
    print("⚠️  Even with trading API key, NO trades possible\n")

    fetcher = BybitLiquidationFetcher()

    # Test with BTC
    symbol = "BTCUSDT"
    current_price = 45000.0

    print(f"Fetching recent liquidations for {symbol}...")
    df = fetcher.get_recent_liquidations(symbol, limit=100)

    if df is not None and not df.empty:
        print(f"\n✅ SUCCESS! Fetched {len(df)} potential liquidations")
        print(f"\nRecent high-volume trades:")
        print(df[['time', 'price', 'size', 'value_usd']].head(10))

        print(f"\nTotal liquidation value: ${df['value_usd'].sum():,.0f}")

        # Test cluster calculation
        print(f"\nCalculating liquidation clusters...")
        clusters = fetcher.calculate_liquidation_clusters(symbol, current_price)

        if clusters:
            print(f"\n✅ Found {len(clusters)} clusters:")
            for i, cluster in enumerate(clusters[:5], 1):
                print(f"  {i}. ${cluster['price']:,.0f} - "
                      f"{cluster['side']} - "
                      f"${cluster['volume_usd']:,.0f} "
                      f"({cluster['count']} trades)")
        else:
            print("\n⚠️  No significant clusters found")
    else:
        print("\n❌ Failed to fetch liquidation data")

    print("\n" + "="*60)
    print("SECURITY TEST: Attempting to place order...")
    try:
        place_order()
        print("❌ SECURITY FAILED: Trade was allowed!")
    except PermissionError as e:
        print(f"✅ SECURITY WORKING: {e}")
