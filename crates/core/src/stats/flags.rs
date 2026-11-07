//! Per-player, per-hand stat flags.
//!
//! A flag records either a decision a player took ("Rfi") or an opportunity to take it
//! ("RfiOpp"). A stat is then `hands with <num> flag / hands with <den> flag`, which SQL can
//! aggregate directly from the stored bits.
//!
//! The bits are persisted, so the order of `flags!` is part of the storage format:
//! **append new flags at the end and never reorder or remove one.** If an existing flag's
//! meaning changes, bump `FLAGS_VERSION` so the stored rows are recomputed.

/// Version of the stored flag semantics. Rows with another version are recomputed.
pub const FLAGS_VERSION: i64 = 5;

/// Bits stored per integer column (SQLite integers are signed 64-bit; bit 63 is avoided).
pub const BITS_PER_WORD: usize = 60;
/// Number of integer columns holding the flags.
pub const WORDS: usize = 4;

macro_rules! flags {
    ($($(#[$doc:meta])* $name:ident),+ $(,)?) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
        #[repr(u16)]
        pub enum Flag { $($(#[$doc])* $name),+ }

        impl Flag {
            pub const ALL: &'static [Flag] = &[$(Flag::$name),+];

            pub fn name(self) -> &'static str {
                match self { $(Flag::$name => stringify!($name)),+ }
            }
        }
    };
}

flags! {
    // --- Preflop frequencies
    Vpip, Pfr,
    /// First decision with nobody having entered the pot.
    RfiOpp, Rfi,
    /// Open raise sizes (to, in big blinds): <=2.25, >2.25, <=2.75, <=3.25, above.
    Rfi2x, Rfi2xPlus, Rfi25x, Rfi3x, Rfi35xPlus,
    LimpOpp, Limp,
    CallOpenOpp, CallOpen,
    ThreeBetOpp, ThreeBet, ThreeBetShove, ThreeBetNonAllIn,
    FourBetOpp, FourBet,
    FiveBetOpp, FiveBet,
    Call4BetOpp, Call4Bet,
    FoldTo3BetOpp, FoldTo3Bet,
    FoldTo3BetShoveOpp, FoldTo3BetShove,
    FoldTo3BetNonAllInOpp, FoldTo3BetNonAllIn,
    FoldTo4BetOpp, FoldTo4Bet,
    LimpFoldOpp, LimpFold,
    FourBetFoldOpp, FourBetFold,
    LimpFacedRaiseOpp,
    LimpFoldVsAllInOpp, LimpFoldVsAllIn,
    LimpFoldVsNonAllInOpp, LimpFoldVsNonAllIn,
    LimpRaise,
    FacingLimpOpp, IsoRaise, IsoAllIn, IsoNonAllIn,
    // --- Facing a raise, by raise size
    FacingRaiseOpp, FoldVsRaise, CallVsRaise,
    FacingOpenShoveOpp,
    Facing2xOpp, FoldVs2x, CallVs2x,
    Facing2xPlusOpp, FoldVs2xPlus, CallVs2xPlus,
    Facing25xOpp, FoldVs25x, CallVs25x,
    Facing3xOpp, FoldVs3x, CallVs3x,
    Facing35xPlusOpp, FoldVs35xPlus, CallVs35xPlus,
    SqueezeOpp, Squeeze,
    // --- Steals (BTN and SB are told apart by the position of the row)
    StealOpp, Steal,
    StealFold3Opp, StealFold3,
    Steal4Bet, Steal4BetFold,
    /// Small blind or big blind facing a raise; call/fold/3-bet are the answers.
    VsStealOpp, VsStealFold, VsStealCall, VsSteal3Bet,
    // --- Spin & Go heads-up and three-handed spots
    HuSbLimpFoldVsRaise, HuSbLimpCallVsRaise, HuSbLimpRaiseVsRaise,
    HuBbVsLimpOpp, HuBbVsLimpCheck, HuBbVsLimpRaise,
    HuBbVsRaiseOpp, HuBbVsRaiseFold, HuBbVsRaiseCall, HuBbVsRaise3Bet,
    ThreeWBbVsStealOpp, ThreeWBbVsStealFold, ThreeWBbVsStealCall, ThreeWBbVsSteal3Bet,
    // --- Push/fold (stack bucket and position are derived from the row)
    OpenShoveOpp, OpenShove,
    IsoShoveOpp, IsoShove,
    RejamOpp, Rejam,
    CallShove, FoldVsShove,
    // --- Postflop (flags version 2)
    CbetOppFlop, CbetFlop, CbetOppTurn, CbetTurn, CbetOppRiver, CbetRiver,
    MissedCbet, MissedCbetIp, MissedCbetIpFold, MissedCbetOop, MissedCbetOopFold,
    CbetFoldOppFlop, CbetFoldFlop, CbetFoldOppTurn, CbetFoldTurn, CbetFoldOppRiver, CbetFoldRiver,
    FoldToCbetOppFlop, FoldToCbetFlop, FoldToCbetOppTurn, FoldToCbetTurn, FoldToCbetOppRiver, FoldToCbetRiver,
    DonkOppFlop, DonkFlop, DonkOppTurn, DonkTurn, DonkOppRiver, DonkRiver,
    DonkFoldOppFlop, DonkFoldFlop, DonkFoldOppTurn, DonkFoldTurn, DonkFoldOppRiver, DonkFoldRiver,
    VsDonkOppFlop, FoldVsDonkFlop, RaiseVsDonkFlop, VsDonkOppTurn, FoldVsDonkTurn, RaiseVsDonkTurn,
    VsCbetRaisedFold, VsCbetRaisedCall, VsCbetRaisedRaise, VsCbet3BetFold, VsCbet3BetCall, VsCbet3BetRaise,
    VsMissedCbetOpp, VsMissedCbet, VsMissedCbetIp, VsMissedCbetBetIp, VsMissedCbetCheckFoldIp,
    VsMissedCbetOop, VsMissedCbetBetOopTurn, VsMissedCbetCheckFoldOop,
    RiverBetOpp, RiverBet, RiverBetShowdown, RiverBetWonShowdown,
    VsRiverBetOpp, VsRiverBetCall, VsRiverBetFold,
    SawFlop, Wtsd, Wsd, Wwsf,
    // --- Check-raise (flags version 5)
    XrOppFlop, XrFlop, XrOppTurn, XrTurn, XrOppRiver, XrRiver,
}

impl Flag {
    pub fn index(self) -> usize {
        self as usize
    }

    /// Storage column and bit mask of this flag.
    pub fn location(self) -> (usize, u64) {
        (self.index() / BITS_PER_WORD, 1u64 << (self.index() % BITS_PER_WORD))
    }
}

const _: () = assert!(Flag::ALL.len() <= BITS_PER_WORD * WORDS, "not enough flag columns");

/// A set of flags.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Flags([u64; WORDS]);

impl Flags {
    pub fn from_words(words: [u64; WORDS]) -> Self {
        Flags(words)
    }

    pub fn words(&self) -> [u64; WORDS] {
        self.0
    }

    pub fn set(&mut self, flag: Flag) {
        let (word, mask) = flag.location();
        self.0[word] |= mask;
    }

    pub fn has(&self, flag: Flag) -> bool {
        let (word, mask) = flag.location();
        self.0[word] & mask != 0
    }

    pub fn iter(&self) -> impl Iterator<Item = Flag> + '_ {
        Flag::ALL.iter().copied().filter(|f| self.has(*f))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags_round_trip_across_word_boundaries() {
        let mut flags = Flags::default();
        let picks = [Flag::Vpip, Flag::SqueezeOpp, Flag::CallShove];
        for f in picks {
            flags.set(f);
        }
        for f in Flag::ALL {
            assert_eq!(flags.has(*f), picks.contains(f), "{}", f.name());
        }
        assert_eq!(flags.iter().collect::<Vec<_>>(), picks);
        assert_eq!(Flags::from_words(flags.words()), flags);
    }

    #[test]
    fn storage_layout_is_pinned() {
        // These indexes are persisted: a failure here means the flag order changed.
        assert_eq!(Flag::Vpip.index(), 0);
        assert_eq!(Flag::Pfr.index(), 1);
        assert_eq!(Flag::Rfi.index(), 3);
        assert_eq!(Flag::ThreeBet.index(), 14);
        assert_eq!(Flag::FoldVsShove.index(), 97);
        assert_eq!(Flag::Wwsf.index(), 163);
        assert_eq!(Flag::XrRiver.index() + 1, Flag::ALL.len());
    }

    #[test]
    fn no_flag_uses_the_sign_bit() {
        for f in Flag::ALL {
            let (word, mask) = f.location();
            assert!(word < WORDS);
            assert!(mask < (1u64 << BITS_PER_WORD), "{}", f.name());
        }
    }
}
