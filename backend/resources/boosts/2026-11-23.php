<?php

/**
 * Prize boost of 23 Nov 2026 (owner, final list sent 09:53): extra instant prizes for the seven live instant-win
 * competitions, bringing each to 40% of sell-out (instant prizes plus end prizes), all site credit paid to winnings.
 * Tiers in the order their numbers are chosen (biggest first): [quantity, value in pence, name]. Names can be
 * changed here before the boost is added; once added, a prize never changes.
 */
return [
    'reason' => 'Prize boost – 23 Nov 2026',
    'competitions' => [
        'smash-my-cash' => [
            [1, 25000, 'Mega Smash'], [5, 5000, 'Power Smash'], [25, 1000, 'Smash Hit'], [60, 500, 'Fiver Smash'], [800, 100, 'Mini Smash'],
        ],
        'pirates-of-the-prizeibbean' => [
            [3, 10000, "Captain's Chest"], [12, 2500, 'Doubloon Drop'], [30, 1000, 'Cutlass Cash'], [60, 500, "Parrot's Pocket Money"], [700, 100, 'Pirate Penny Pound'],
        ],
        'drop-it-like-its-hot' => [
            [2, 25000, 'Red Hot Drop'], [5, 10000, 'Scorchio'], [20, 2500, 'Heatwave'], [50, 1000, 'Sizzling Tenner'], [150, 500, 'Warm Fiver'], [1500, 100, 'Hot Pound'],
        ],
        'the-great-cash-escape' => [
            [1, 50000, 'Great Escape Jackpot'], [2, 25000, 'Tunnel Treasure'], [5, 10000, 'Breakout Bundle'], [10, 5000, 'Over The Wall'],
            [25, 2000, 'Getaway Twenty'], [50, 1000, 'Lock Pick Tenner'], [150, 500, 'Jailbreak Fiver'], [500, 200, 'Escape Hatch Twoer'],
        ],
        'liams-humbug-heist' => [
            [5, 5000, 'Vault Job'], [25, 2000, 'Safe Cracker'], [50, 1000, 'Getaway Tenner'], [50, 500, 'Humbug Fiver'],
        ],
        'demis-grinchmas-gold' => [
            [2, 25000, 'Grinchmas Jackpot'], [5, 10000, 'Golden Grump'], [15, 5000, 'Green Gold'], [30, 2000, 'Grumpy Gift'], [55, 1000, 'Sour Sprout Tenner'],
        ],
        'blankets-and-banknotes' => [
            [1, 50000, 'Duvet Day Jackpot'], [4, 25000, 'Snuggle Stash'], [8, 10000, 'Cosy Cash'], [10, 5000, 'Fleece Fifty'], [50, 1000, 'Hot Water Bottle Tenner'],
        ],
    ],
];
