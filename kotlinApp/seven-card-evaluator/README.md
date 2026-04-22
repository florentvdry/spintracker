#7 card evaluator

Evaluates 7-card poker hands and produces same results as Cactus Kev's [evaluator](http://suffe.cool/poker/7462.html) ranging from 1 to 7462.

- Uses ~15MB lookup table (array of ~7.8M 2byte values) where ~54K are reserved for values, the rest is blank.
- Loads data in ~2.4s 
- Best result, when evaluating ordered hands, was 599MHs or 223ms. On i7@2.6GHz (4.6GHz boost)

Algorithm can be split into 3 parts. But all the parts are based on the same idea:
- adding together 7 pre-calculated values and getting unique hash

## Determining flush

Every suit has one of 4 numbers associated with it. Adding any of them 7 times produces a value, if same value was added 5, 6 or 7 times
one of 4 bits will be set. For example:
```
>>> bin((3790*4+3310+3825+12014) & 0x11110)
'0b0'
>>> bin((3790*5+3310+3825) & 0x11110)
'0b100000000'
>>> bin((3790*6+3825) & 0x11110)
'0b100000000'
>>> bin((3790*7) & 0x11110)
'0b100000000'
```

## Evaluating a flush

In order to determine (straight) flush equivalence value, every card has one of 13 associated suit values that are used to calculate unique hash. 
Adding these values 5, 6 or 7 times will give an index of an array ranging from 31 to 6848.

These numbers can be added only when cards are of the same suit. In order to do that every of these 13 values are shifted by 16 bits and then shifted 
back depending on which bit was set when determining a flush.
```
>>> CLUBS = 3
>>> suit = 1728 << 16*CLUBS
>>> hash += suit >> ((3790*6+3825) & 0x11110).bit_length()
...
>>> hash &= 0x1FFF
```

## Evaluating non flushes

Same principle applies after determining that hand does not contain a flush, but this time it's required to add 7 out of 13 per-calculated values. 
Since suits don't play any role, same number can be added up to 4 times, and it will produce a sum which is an index pointing to equivelance value in lookup table.
```
>>> lookup[0+1+5+22+98+453+2031]
```
In this case it's 8 high straight

## Evaluator module

Functionality is divided between 3 classes: 
- Card class that contains pre-calculated values which are used when adding and calculating hashes
-- constructor accepts `int` values (0-51) as card value 
--- face value is determined by `div 4`, meaning that it ranges from 0 (deuce) to 12 (ace) 
--- suit value is determined by `mod 4`, meaning that it ranges from 0 to 3. Which suit is represented by which value (0-3) has no meaning as long as it's consistent.
- Singleton DataLoaded class which loads bin files from resources, and gives access to two arrays
- Evaluator which constructs DataLoaded instance and provides static methods to get equivalence values.
-- Method 7 accepting `int's` (0-51), as parameters, performs slightly better than one that accepts Card instances
--- accepts same values as Card constructor 

## App module

Contains main class which accepts number how many times (20 by default) to run hand evaluation and outputs results
- checksum
- time/ms

It runs in a single thread, although Evaluator does not keep any state and can be safely used in multithreaded environment.

# TODO

- Pre-calculated values might be used to determine 5-card or 6-card hand equivalence values, but it would require to update lookup 
table and fill in some blank values.
