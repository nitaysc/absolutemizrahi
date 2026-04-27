// Update Roulette.tsx to improve the betting system

import React, { useState } from 'react';
import Notification from './Notification'; // Import a notification component

const Roulette = () => {
    const [coins, setCoins] = useState(100); // Initial coins
    const [notification, setNotification] = useState(''); // For toast notification

    const handleBetLoss = () => {
        if (coins > 0) {
            // Deduct coins on loss
            setCoins(coins - 10);
            setNotification('You lost 10 coins. Better luck next time!'); // Inform the user
        } else {
            setNotification('Insufficient coins to continue betting.'); // Better error messaging
        }
    };

    return (
        <div>
            <h1>Roulette Game</h1>
            <p>Coins: {coins}</p>
            <button onClick={handleBetLoss}>Place Bet</button>
            {notification && <Notification message={notification} />} {/* Toast notification */}
        </div>
    );
};

export default Roulette;