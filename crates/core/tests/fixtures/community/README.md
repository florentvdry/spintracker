# Community sample corpus

Hand histories contributed by players, so the parsers are tested on real files from every room.
Every `.txt` file in this folder is read by the test `tests/community_corpus.rs`: each one must be
recognised by a parser and give at least one hand.

## Before you add a file

- **Anonymise it.** Replace every player name, player id, e-mail address and file path with a
  neutral stand-in (for example `Hero`, `Player 1`). The repository is public: anything committed
  stays public.
- Keep the file as the room wrote it: do not reformat, do not cut hands in the middle.
- Use one room per file, and say the room and the format in the file name, for example
  `winamax-expresso-01.txt`.
- Say in your pull request which room and which format the file is, and what it covers (a
  bust-out, an all-in, a rebuy, and so on).

## Format

Plain text, UTF-8, the file exactly as the room exports it (one file can hold several hands).
A tournament summary file is not needed for the corpus test; it only checks hand parsing.
