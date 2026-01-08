"""
Test Data Generator
Generates synthetic price and liquidation data for testing when API access is unavailable
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def generate_test_price_data(
    symbol: str,
    timeframe: str,
    start_date: datetime,
    end_date: datetime,
    initial_price: float = 45000.0
) -> pd.DataFrame:
    """
    Generate realistic synthetic OHLCV data for testing

    Args:
        symbol: Trading pair
        timeframe: Candle timeframe
        start_date: Start datetime
        end_date: End datetime
        initial_price: Starting price

    Returns:
        DataFrame with OHLCV data
    """
    # Convert timeframe to minutes
    timeframe_map = {
        "1m": 1, "5m": 5, "15m": 15, "30m": 30,
        "1h": 60, "4h": 240, "1d": 1440
    }
    minutes = timeframe_map.get(timeframe, 5)

    # Calculate number of candles
    delta = end_date - start_date
    total_minutes = int(delta.total_seconds() / 60)
    num_candles = total_minutes // minutes

    logger.info(f"Generating {num_candles} synthetic candles for {symbol}")

    # Generate timestamps
    timestamps = pd.date_range(start=start_date, periods=num_candles, freq=f"{minutes}min")

    # Generate price data with realistic movement
    # Use geometric Brownian motion for realistic price movement
    np.random.seed(42)  # For reproducibility

    # Parameters - realistic for 5min crypto candles
    volatility = 0.0015  # 0.15% volatility per candle (realistic for BTC)
    drift = 0.00001  # Very slight upward drift

    # Generate returns
    returns = np.random.normal(drift, volatility, num_candles)

    # Generate close prices
    close_prices = [initial_price]
    for i in range(1, num_candles):
        new_price = close_prices[-1] * (1 + returns[i])
        close_prices.append(new_price)

    # Generate OHLCV
    data = []
    for i, (ts, close) in enumerate(zip(timestamps, close_prices)):
        # Generate high/low/open with realistic wicks
        wick_size = abs(np.random.normal(0, close * 0.003))  # 0.3% average wick
        high = close + wick_size
        low = close - wick_size

        # Open is previous close (for consistency)
        open_price = close_prices[i-1] if i > 0 else initial_price

        # Ensure high/low make sense
        high = max(high, open_price, close)
        low = min(low, open_price, close)

        # Generate volume
        volume = abs(np.random.normal(500, 200))

        data.append({
            "open": open_price,
            "high": high,
            "low": low,
            "close": close,
            "volume": volume
        })

    df = pd.DataFrame(data, index=timestamps)

    logger.info(f"Generated price range: ${df['close'].min():.2f} - ${df['close'].max():.2f}")

    return df


def generate_test_liquidation_clusters(
    price_data: pd.DataFrame,
    num_clusters: int = 8
) -> list:
    """
    Generate synthetic liquidation clusters based on price data

    Args:
        price_data: DataFrame with price data
        num_clusters: Number of clusters to generate

    Returns:
        List of liquidation cluster dicts
    """
    current_price = price_data.iloc[-1]["close"]
    high_20 = price_data["high"].rolling(20).max().iloc[-1]
    low_20 = price_data["low"].rolling(20).min().iloc[-1]

    clusters = []

    # Add clusters at support/resistance levels
    # Cluster above current price (resistance)
    for i in range(num_clusters // 2):
        offset = (i + 1) * 0.005  # 0.5%, 1.0%, 1.5%...
        cluster_price = current_price * (1 + offset)
        clusters.append({
            "price": cluster_price,
            "volume_usd": np.random.uniform(150000, 800000),
            "side": "short",
            "distance_percent": abs(cluster_price - current_price) / current_price * 100,
            "timestamp": datetime.now()
        })

    # Cluster below current price (support)
    for i in range(num_clusters // 2):
        offset = (i + 1) * 0.005  # 0.5%, 1.0%, 1.5%...
        cluster_price = current_price * (1 - offset)
        clusters.append({
            "price": cluster_price,
            "volume_usd": np.random.uniform(150000, 800000),
            "side": "long",
            "distance_percent": abs(cluster_price - current_price) / current_price * 100,
            "timestamp": datetime.now()
        })

    # Add a couple at recent highs/lows
    clusters.append({
        "price": high_20,
        "volume_usd": np.random.uniform(300000, 1000000),
        "side": "short",
        "distance_percent": abs(high_20 - current_price) / current_price * 100,
        "timestamp": datetime.now()
    })

    clusters.append({
        "price": low_20,
        "volume_usd": np.random.uniform(300000, 1000000),
        "side": "long",
        "distance_percent": abs(low_20 - current_price) / current_price * 100,
        "timestamp": datetime.now()
    })

    logger.info(f"Generated {len(clusters)} synthetic liquidation clusters")

    return clusters


if __name__ == "__main__":
    # Test the generator
    print("Testing Data Generator...\n")

    end_date = datetime.now()
    start_date = end_date - timedelta(days=7)

    # Generate price data
    price_data = generate_test_price_data(
        "BTCUSDT",
        "5m",
        start_date,
        end_date,
        initial_price=45000.0
    )

    print(f"Generated {len(price_data)} candles")
    print("\nFirst 5 candles:")
    print(price_data.head())
    print("\nLast 5 candles:")
    print(price_data.tail())

    # Generate liquidation clusters
    clusters = generate_test_liquidation_clusters(price_data)

    print(f"\nGenerated {len(clusters)} liquidation clusters:")
    for i, cluster in enumerate(clusters[:5]):
        print(f"  {i+1}. ${cluster['price']:.2f} - {cluster['side']} - ${cluster['volume_usd']:,.0f}")
