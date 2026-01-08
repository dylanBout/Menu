"""
Binance Liquidation Data Fetcher (FREE)
Uses Binance's public API to get liquidation orders
No API key required for basic usage
"""

import requests
import pandas as pd
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class BinanceLiquidationFetcher:
    """Fetch liquidation data from Binance (FREE - no API key needed)"""

    def __init__(self):
        self.base_url = "https://fapi.binance.com"
        self.session = requests.Session()
        logger.info("BinanceLiquidationFetcher initialized (FREE)")

    def get_recent_liquidations(
        self,
        symbol: str,
        limit: int = 1000
    ) -> Optional[pd.DataFrame]:
        """
        Get recent liquidation orders from Binance

        Args:
            symbol: Trading pair (e.g., 'BTCUSDT')
            limit: Number of liquidations to fetch (max 1000)

        Returns:
            DataFrame with liquidation data
        """
        try:
            endpoint = f"{self.base_url}/fapi/v1/allForceOrders"
            params = {
                "symbol": symbol,
                "limit": limit
            }

            logger.debug(f"Fetching liquidations for {symbol}")
            response = self.session.get(endpoint, params=params, timeout=10)

            if response.status_code == 200:
                data = response.json()
                if data:
                    df = pd.DataFrame(data)

                    # Parse timestamp
                    df['time'] = pd.to_datetime(df['time'], unit='ms')

                    # Convert to numeric
                    df['price'] = pd.to_numeric(df['price'])
                    df['origQty'] = pd.to_numeric(df['origQty'])
                    df['executedQty'] = pd.to_numeric(df['executedQty'])

                    # Calculate USD value
                    df['value_usd'] = df['price'] * df['executedQty']

                    logger.info(f"Fetched {len(df)} liquidations for {symbol}")
                    return df
                else:
                    logger.warning(f"No liquidation data for {symbol}")
                    return pd.DataFrame()
            else:
                logger.error(f"API error {response.status_code}: {response.text}")
                return None

        except Exception as e:
            logger.error(f"Error fetching liquidations: {e}")
            return None

    def calculate_liquidation_clusters(
        self,
        symbol: str,
        current_price: float,
        lookback_minutes: int = 60,
        min_cluster_value: float = 100000
    ) -> List[Dict]:
        """
        Calculate liquidation clusters from recent liquidation data

        Args:
            symbol: Trading pair
            current_price: Current market price
            lookback_minutes: How far back to analyze
            min_cluster_value: Minimum cluster size in USD

        Returns:
            List of liquidation cluster dictionaries
        """
        df = self.get_recent_liquidations(symbol, limit=1000)

        if df is None or df.empty:
            return []

        # Filter by time
        cutoff_time = datetime.now() - timedelta(minutes=lookback_minutes)
        df = df[df['time'] >= cutoff_time].copy()

        # Group by price ranges (0.5% buckets)
        bucket_size = current_price * 0.005  # 0.5% buckets
        df['price_bucket'] = (df['price'] / bucket_size).round() * bucket_size

        # Aggregate by bucket and side
        clusters = df.groupby(['price_bucket', 'side']).agg({
            'value_usd': 'sum',
            'origQty': 'count'
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
                'side': 'long' if row['side'] == 'BUY' else 'short',
                'count': row['count'],
                'distance_percent': row['distance_percent'],
                'timestamp': datetime.now()
            })

        # Sort by volume (largest first)
        result.sort(key=lambda x: x['volume_usd'], reverse=True)

        logger.info(f"Found {len(result)} liquidation clusters for {symbol}")
        return result

    def get_liquidation_heatmap(
        self,
        symbol: str,
        current_price: float
    ) -> pd.DataFrame:
        """
        Generate liquidation heatmap from recent data
        Compatible with existing strategy code

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


def get_binance_liquidation_fetcher():
    """Get a Binance liquidation fetcher instance"""
    return BinanceLiquidationFetcher()


if __name__ == "__main__":
    # Test the fetcher
    print("Testing Binance Liquidation Fetcher (FREE)...\n")

    fetcher = BinanceLiquidationFetcher()

    # Test with BTC
    symbol = "BTCUSDT"
    current_price = 45000.0

    print(f"Fetching recent liquidations for {symbol}...")
    df = fetcher.get_recent_liquidations(symbol, limit=100)

    if df is not None and not df.empty:
        print(f"\n✅ SUCCESS! Fetched {len(df)} liquidations")
        print(f"\nRecent liquidations:")
        print(df[['time', 'side', 'price', 'origQty', 'value_usd']].head(10))

        print(f"\nTotal liquidation value: ${df['value_usd'].sum():,.0f}")
        print(f"Long liquidations: {len(df[df['side']=='BUY'])}")
        print(f"Short liquidations: {len(df[df['side']=='SELL'])}")

        # Test cluster calculation
        print(f"\nCalculating liquidation clusters...")
        clusters = fetcher.calculate_liquidation_clusters(symbol, current_price)

        if clusters:
            print(f"\n✅ Found {len(clusters)} clusters:")
            for i, cluster in enumerate(clusters[:5], 1):
                print(f"  {i}. ${cluster['price']:,.0f} - "
                      f"{cluster['side']} - "
                      f"${cluster['volume_usd']:,.0f} "
                      f"({cluster['count']} orders)")
        else:
            print("\n⚠️  No significant clusters found")
    else:
        print("\n❌ Failed to fetch liquidation data")
