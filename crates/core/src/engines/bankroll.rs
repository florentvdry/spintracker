//! Bankroll over time: deposits, withdrawals and the euro result of each tournament, in order.

use chrono::NaiveDateTime;
use serde::Serialize;

/// A deposit (positive) or a withdrawal (negative).
#[derive(Debug, Clone, PartialEq)]
pub struct Movement {
    pub time: NaiveDateTime,
    pub amount: f64,
}

/// One point of the bankroll curve: the balance after an event.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Point {
    pub time: String,
    pub balance: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Totals {
    pub deposits: f64,
    pub withdrawals: f64,
    pub profit: f64,
    pub balance: f64,
}

/// Balance after each movement and tournament, from the oldest. Starts at 0: the first deposit
/// is the first point of the curve.
pub fn curve(movements: &[Movement], tournaments: &[(NaiveDateTime, f64)]) -> Vec<Point> {
    let mut events: Vec<(NaiveDateTime, f64)> = movements.iter().map(|m| (m.time, m.amount)).chain(tournaments.iter().copied()).collect();
    events.sort_by_key(|(time, _)| *time);
    let mut balance = 0.0;
    events
        .into_iter()
        .map(|(time, amount)| {
            balance += amount;
            Point { time: time.format("%Y-%m-%d %H:%M:%S").to_string(), balance }
        })
        .collect()
}

pub fn totals(movements: &[Movement], tournaments: &[(NaiveDateTime, f64)]) -> Totals {
    let deposits: f64 = movements.iter().filter(|m| m.amount > 0.0).map(|m| m.amount).sum();
    let withdrawals: f64 = movements.iter().filter(|m| m.amount < 0.0).map(|m| m.amount).sum();
    let profit: f64 = tournaments.iter().map(|(_, euro)| euro).sum();
    Totals { deposits, withdrawals, profit, balance: deposits + withdrawals + profit }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn at(day: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 1, day).unwrap().and_hms_opt(12, 0, 0).unwrap()
    }

    #[test]
    fn curve_follows_deposits_results_and_withdrawals_in_order() {
        let movements = [Movement { time: at(1), amount: 100.0 }, Movement { time: at(4), amount: -30.0 }];
        let tournaments = [(at(2), 15.0), (at(3), -5.0)];
        let points: Vec<f64> = curve(&movements, &tournaments).iter().map(|p| p.balance).collect();
        assert_eq!(points, vec![100.0, 115.0, 110.0, 80.0]);
    }

    #[test]
    fn totals_split_deposits_withdrawals_and_profit() {
        let movements = [Movement { time: at(1), amount: 100.0 }, Movement { time: at(4), amount: -30.0 }];
        let tournaments = [(at(2), 15.0), (at(3), -5.0)];
        let t = totals(&movements, &tournaments);
        assert_eq!(t, Totals { deposits: 100.0, withdrawals: -30.0, profit: 10.0, balance: 80.0 });
    }

    #[test]
    fn empty_history_has_no_points() {
        assert!(curve(&[], &[]).is_empty());
        assert_eq!(totals(&[], &[]).balance, 0.0);
    }
}
