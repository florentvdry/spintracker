//! Seat arithmetic for the HUD: where an opponent sits relative to the hero.
//!
//! Hand histories number seats per room: Winamax uses 1, 2, 3 on a three-handed table and Unibet
//! 1, 3, 5. Panel positions are stored per seat relative to the hero, so the same layout works
//! wherever the hero was seated.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Room {
    Winamax,
    Unibet,
}

impl Room {
    pub fn parse(name: &str) -> Option<Room> {
        match name {
            "Winamax" => Some(Room::Winamax),
            "Unibet" => Some(Room::Unibet),
            _ => None,
        }
    }

    /// Position of a seat number in the room's seating order (0-based), if it is a valid seat.
    fn slot(self, seat: u8, table_size: u8) -> Option<u8> {
        let slot = match self {
            Room::Winamax => seat.checked_sub(1)?,
            // Unibet numbers the seats of a Spin table 1, 3, 5.
            Room::Unibet if seat % 2 == 1 => (seat - 1) / 2,
            Room::Unibet => return None,
        };
        (slot < table_size).then_some(slot)
    }
}

/// How many seats the table has, from the number of players it started with.
pub fn table_size(players: usize) -> Option<u8> {
    match players {
        2 => Some(2),
        3 => Some(3),
        _ => None,
    }
}

/// Seat of `seat` counted from the hero: 0 is the hero, 1 the next player in turn order.
/// `None` when a seat number does not exist at this table.
pub fn relative_seat(room: Room, seat: u8, hero_seat: u8, table_size: u8) -> Option<u8> {
    let slot = room.slot(seat, table_size)?;
    let hero = room.slot(hero_seat, table_size)?;
    Some((slot + table_size - hero) % table_size)
}

/// The key placements are stored under (`+1`, `+2`); `None` for the hero.
pub fn seat_key(relative: u8) -> Option<String> {
    (relative > 0).then(|| format!("+{relative}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn winamax_seats_are_counted_from_the_hero() {
        // Hero on seat 2 of a three-handed table: seat 3 is next, seat 1 comes after.
        assert_eq!(relative_seat(Room::Winamax, 2, 2, 3), Some(0));
        assert_eq!(relative_seat(Room::Winamax, 3, 2, 3), Some(1));
        assert_eq!(relative_seat(Room::Winamax, 1, 2, 3), Some(2));
        // Hero on seat 3: the order wraps around.
        assert_eq!(relative_seat(Room::Winamax, 1, 3, 3), Some(1));
        assert_eq!(relative_seat(Room::Winamax, 2, 3, 3), Some(2));
    }

    #[test]
    fn unibet_seats_one_three_five_map_to_the_same_order() {
        assert_eq!(relative_seat(Room::Unibet, 3, 1, 3), Some(1));
        assert_eq!(relative_seat(Room::Unibet, 5, 1, 3), Some(2));
        assert_eq!(relative_seat(Room::Unibet, 1, 5, 3), Some(1));
        assert_eq!(relative_seat(Room::Unibet, 3, 5, 3), Some(2));
    }

    #[test]
    fn heads_up_has_a_single_opponent_seat() {
        assert_eq!(relative_seat(Room::Winamax, 1, 2, 2), Some(1));
        assert_eq!(relative_seat(Room::Winamax, 2, 1, 2), Some(1));
        assert_eq!(seat_key(1).as_deref(), Some("+1"));
    }

    #[test]
    fn invalid_seats_are_rejected() {
        assert_eq!(relative_seat(Room::Winamax, 0, 1, 3), None);
        assert_eq!(relative_seat(Room::Winamax, 4, 1, 3), None);
        assert_eq!(relative_seat(Room::Unibet, 2, 1, 3), None, "Unibet seats are odd");
        assert_eq!(relative_seat(Room::Unibet, 7, 1, 3), None);
        assert_eq!(seat_key(0), None);
        assert_eq!((table_size(2), table_size(3), table_size(6)), (Some(2), Some(3), None));
        assert_eq!((Room::parse("Winamax"), Room::parse("Betclic")), (Some(Room::Winamax), None));
    }
}
