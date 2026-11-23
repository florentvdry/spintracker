# Community hand histories

A folder of **anonymised** hand histories that anyone can contribute, so every parser is tested on
hands written by real rooms. A test (`tests/community_corpus.rs`) parses **every file** of this
folder: add a file and it is checked the next time the tests run.

## How to contribute a file

1. Take a hand-history file from your room (Winamax, Unibet, Betclic, PokerStars, GGPoker, PMU...).
2. Anonymise it. In SpinTracker: **Settings > Anonymise a hand history**. It replaces every player
   name with `Hero`, `Player A`, `Player B`... and nothing else. Open the result and read it: no real
   name, e-mail address or account number may remain.
3. Name it `<room>-<format>-<short description>.txt` (or `.xml`), for example
   `winamax-expresso-all-in-preflop.txt`. Keep it small: a handful of hands that show something
   interesting (an all-in, an ante, a split pot, an odd header).
4. Put it in this folder and open a pull request. Say which room and version of the client wrote it.

## What the test checks

- the file is recognised by a room's parser and gives at least one hand;
- every hand has players, a positive pot or a documented reason, and chips only move around (the
  players' results add up to the rake);
- no e-mail address is in the file.

Files whose name contains `synthetic` were written by hand to exercise a parser. They are not real
hands and they are not the proof a parser works: replace them with real ones when you can.
