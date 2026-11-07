//! Formulas over stats ("aggression factor", ratios): a small arithmetic language with a parser of
//! its own. Nothing here touches SQL or evaluates user text any other way.
//!
//! The language has numbers, the operators `+ - * /`, parentheses, unary minus and references to
//! stats by name: `cbet` is the stat's ratio (numerator over denominator), `cbet.num` and
//! `cbet.den` its two counts. A division by zero, or a reference to a stat without data, gives no
//! value at all (the UI shows a dash), never an infinity or a zero.

use std::collections::{HashMap, HashSet};

/// Characters of a formula.
pub const MAX_EXPRESSION_CHARS: usize = 200;
/// Nesting of parentheses and unary minuses.
pub const MAX_EXPRESSION_DEPTH: usize = 8;
/// Distinct stats a formula reads.
pub const MAX_REFERENCES: usize = 8;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExpressionError {
    Empty,
    TooLong,
    TooDeep,
    TooManyReferences,
    /// A character the language does not have, with its position.
    UnexpectedCharacter(usize),
    /// The formula ends too early or has something where an operand should be, at this position.
    UnexpectedToken(usize),
    UnbalancedParenthesis,
    /// A number that is not a finite number.
    BadNumber(usize),
    /// A reference to a stat that does not exist.
    UnknownStat(String),
    /// Stats that read each other, directly or not; the first one met in the loop.
    Cycle(String),
}

impl std::fmt::Display for ExpressionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExpressionError::Empty => write!(f, "the formula is empty"),
            ExpressionError::TooLong => write!(f, "a formula has at most {MAX_EXPRESSION_CHARS} characters"),
            ExpressionError::TooDeep => write!(f, "a formula nests at most {MAX_EXPRESSION_DEPTH} levels"),
            ExpressionError::TooManyReferences => write!(f, "a formula reads at most {MAX_REFERENCES} stats"),
            ExpressionError::UnexpectedCharacter(at) => write!(f, "unexpected character at position {at}"),
            ExpressionError::UnexpectedToken(at) => write!(f, "unexpected token at position {at}"),
            ExpressionError::UnbalancedParenthesis => write!(f, "unbalanced parenthesis"),
            ExpressionError::BadNumber(at) => write!(f, "bad number at position {at}"),
            ExpressionError::UnknownStat(name) => write!(f, "unknown stat {name:?}"),
            ExpressionError::Cycle(name) => write!(f, "stat {name:?} depends on itself"),
        }
    }
}

/// What part of a stat a reference reads.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Part {
    Ratio,
    Num,
    Den,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Op {
    Add,
    Sub,
    Mul,
    Div,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Expr {
    Number(f64),
    Reference { stat: String, part: Part },
    Negate(Box<Expr>),
    Binary { op: Op, left: Box<Expr>, right: Box<Expr> },
}

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Number(f64),
    Name(String),
    Plus,
    Minus,
    Star,
    Slash,
    Open,
    Close,
}

fn tokenize(text: &str) -> Result<Vec<(Token, usize)>, ExpressionError> {
    let chars: Vec<char> = text.chars().collect();
    let mut tokens = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let start = i;
        if c.is_whitespace() {
            i += 1;
        } else if c.is_ascii_digit() || c == '.' {
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                i += 1;
            }
            let literal: String = chars[start..i].iter().collect();
            let value: f64 = literal.parse().map_err(|_| ExpressionError::BadNumber(start))?;
            if !value.is_finite() {
                return Err(ExpressionError::BadNumber(start));
            }
            tokens.push((Token::Number(value), start));
        } else if c.is_alphabetic() || c == '_' {
            // A stat name: letters, digits, underscores, and a dot for `.num` / `.den`.
            while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_' || chars[i] == '.') {
                i += 1;
            }
            tokens.push((Token::Name(chars[start..i].iter().collect()), start));
        } else {
            let token = match c {
                '+' => Token::Plus,
                '-' => Token::Minus,
                '*' => Token::Star,
                '/' => Token::Slash,
                '(' => Token::Open,
                ')' => Token::Close,
                _ => return Err(ExpressionError::UnexpectedCharacter(start)),
            };
            tokens.push((token, start));
            i += 1;
        }
    }
    Ok(tokens)
}

struct Parser {
    tokens: Vec<(Token, usize)>,
    next: usize,
    end: usize,
}

impl Parser {
    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.next).map(|(t, _)| t)
    }

    fn at(&self) -> usize {
        self.tokens.get(self.next).map_or(self.end, |(_, at)| *at)
    }

    /// `sum := product (('+' | '-') product)*`
    fn sum(&mut self, depth: usize) -> Result<Expr, ExpressionError> {
        let mut left = self.product(depth)?;
        while let Some(op) = self.peek().and_then(|t| match t {
            Token::Plus => Some(Op::Add),
            Token::Minus => Some(Op::Sub),
            _ => None,
        }) {
            self.next += 1;
            let right = self.product(depth)?;
            left = Expr::Binary { op, left: Box::new(left), right: Box::new(right) };
        }
        Ok(left)
    }

    /// `product := unary (('*' | '/') unary)*`
    fn product(&mut self, depth: usize) -> Result<Expr, ExpressionError> {
        let mut left = self.unary(depth)?;
        while let Some(op) = self.peek().and_then(|t| match t {
            Token::Star => Some(Op::Mul),
            Token::Slash => Some(Op::Div),
            _ => None,
        }) {
            self.next += 1;
            let right = self.unary(depth)?;
            left = Expr::Binary { op, left: Box::new(left), right: Box::new(right) };
        }
        Ok(left)
    }

    /// `unary := '-' unary | atom`
    fn unary(&mut self, depth: usize) -> Result<Expr, ExpressionError> {
        if depth > MAX_EXPRESSION_DEPTH {
            return Err(ExpressionError::TooDeep);
        }
        if self.peek() == Some(&Token::Minus) {
            self.next += 1;
            return Ok(Expr::Negate(Box::new(self.unary(depth + 1)?)));
        }
        self.atom(depth)
    }

    fn atom(&mut self, depth: usize) -> Result<Expr, ExpressionError> {
        let at = self.at();
        match self.tokens.get(self.next).map(|(t, _)| t.clone()) {
            Some(Token::Number(value)) => {
                self.next += 1;
                Ok(Expr::Number(value))
            }
            Some(Token::Name(name)) => {
                self.next += 1;
                let (stat, part) = match name.rsplit_once('.') {
                    Some((stat, "num")) => (stat, Part::Num),
                    Some((stat, "den")) => (stat, Part::Den),
                    Some(_) => return Err(ExpressionError::UnexpectedToken(at)),
                    None => (name.as_str(), Part::Ratio),
                };
                if stat.is_empty() {
                    return Err(ExpressionError::UnexpectedToken(at));
                }
                Ok(Expr::Reference { stat: stat.to_string(), part })
            }
            Some(Token::Open) => {
                self.next += 1;
                let inner = self.sum(depth + 1)?;
                if self.peek() != Some(&Token::Close) {
                    return Err(ExpressionError::UnbalancedParenthesis);
                }
                self.next += 1;
                Ok(inner)
            }
            _ => Err(ExpressionError::UnexpectedToken(at)),
        }
    }
}

/// Parses a formula, checking its size and depth.
pub fn parse(text: &str) -> Result<Expr, ExpressionError> {
    if text.trim().is_empty() {
        return Err(ExpressionError::Empty);
    }
    if text.chars().count() > MAX_EXPRESSION_CHARS {
        return Err(ExpressionError::TooLong);
    }
    let tokens = tokenize(text)?;
    let mut parser = Parser { tokens, next: 0, end: text.chars().count() };
    let expr = parser.sum(0)?;
    if parser.next < parser.tokens.len() {
        // A closing parenthesis with no opening one, or two operands in a row.
        return Err(if parser.peek() == Some(&Token::Close) { ExpressionError::UnbalancedParenthesis } else { ExpressionError::UnexpectedToken(parser.at()) });
    }
    if references(&expr).len() > MAX_REFERENCES {
        return Err(ExpressionError::TooManyReferences);
    }
    Ok(expr)
}

/// The stats a formula reads, once each, in order of appearance.
pub fn references(expr: &Expr) -> Vec<String> {
    fn walk(expr: &Expr, seen: &mut Vec<String>) {
        match expr {
            Expr::Number(_) => {}
            Expr::Reference { stat, .. } => {
                if !seen.contains(stat) {
                    seen.push(stat.clone());
                }
            }
            Expr::Negate(inner) => walk(inner, seen),
            Expr::Binary { left, right, .. } => {
                walk(left, seen);
                walk(right, seen);
            }
        }
    }
    let mut seen = Vec::new();
    walk(expr, &mut seen);
    seen
}

/// The counts behind a stat for one player.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Counts {
    pub num: f64,
    pub den: f64,
}

/// The value of a formula and the number of opportunities it rests on: the smallest denominator
/// among the stats it reads as a ratio, so a figure is never presented as more reliable than its
/// weakest part. `None` when a part has no data or a division by zero occurs.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Evaluated {
    pub value: f64,
    pub sample: f64,
}

pub fn evaluate(expr: &Expr, counts: &dyn Fn(&str) -> Option<Counts>) -> Option<Evaluated> {
    fn value(expr: &Expr, counts: &dyn Fn(&str) -> Option<Counts>, sample: &mut Option<f64>) -> Option<f64> {
        match expr {
            Expr::Number(n) => Some(*n),
            Expr::Reference { stat, part } => {
                let c = counts(stat)?;
                match part {
                    Part::Num => Some(c.num),
                    Part::Den => Some(c.den),
                    Part::Ratio => {
                        if c.den <= 0.0 {
                            return None;
                        }
                        *sample = Some(sample.map_or(c.den, |s| s.min(c.den)));
                        Some(c.num / c.den)
                    }
                }
            }
            Expr::Negate(inner) => value(inner, counts, sample).map(|v| -v),
            Expr::Binary { op, left, right } => {
                let (l, r) = (value(left, counts, sample)?, value(right, counts, sample)?);
                match op {
                    Op::Add => Some(l + r),
                    Op::Sub => Some(l - r),
                    Op::Mul => Some(l * r),
                    Op::Div => (r != 0.0).then(|| l / r),
                }
            }
        }
    }
    let mut sample = None;
    let result = value(expr, counts, &mut sample)?;
    // A formula that only reads counts has no ratio to weigh: its sample is the smallest count it reads.
    let sample = sample.or_else(|| references(expr).iter().filter_map(|name| counts(name)).map(|c| c.den).reduce(f64::min)).unwrap_or(0.0);
    result.is_finite().then_some(Evaluated { value: result, sample })
}

/// Checks that every stat read exists in `known`, and that the stats do not read each other in a
/// loop. `graph` maps a formula stat to the stats it reads; plain stats are absent from it.
pub fn check_dependencies(graph: &HashMap<String, Vec<String>>, known: &HashSet<String>) -> Result<(), ExpressionError> {
    for reads in graph.values() {
        if let Some(missing) = reads.iter().find(|name| !known.contains(*name)) {
            return Err(ExpressionError::UnknownStat(missing.clone()));
        }
    }
    // Depth-first search: a stat met again while it is still being explored closes a loop.
    #[derive(Clone, Copy, PartialEq)]
    enum Mark {
        Exploring,
        Done,
    }
    fn visit(name: &str, graph: &HashMap<String, Vec<String>>, marks: &mut HashMap<String, Mark>) -> Result<(), ExpressionError> {
        match marks.get(name) {
            Some(Mark::Done) => return Ok(()),
            Some(Mark::Exploring) => return Err(ExpressionError::Cycle(name.to_string())),
            None => {}
        }
        marks.insert(name.to_string(), Mark::Exploring);
        for next in graph.get(name).into_iter().flatten() {
            visit(next, graph, marks)?;
        }
        marks.insert(name.to_string(), Mark::Done);
        Ok(())
    }
    let mut marks = HashMap::new();
    let mut names: Vec<&String> = graph.keys().collect();
    names.sort();
    names.into_iter().try_for_each(|name| visit(name, graph, &mut marks))
}

/// Stats that read `removed` (directly or not), which a deletion would leave without a value.
pub fn dependents_of(removed: &str, graph: &HashMap<String, Vec<String>>) -> Vec<String> {
    let mut found: HashSet<String> = HashSet::new();
    let mut frontier = vec![removed.to_string()];
    while let Some(target) = frontier.pop() {
        for (name, reads) in graph {
            if reads.contains(&target) && found.insert(name.clone()) {
                frontier.push(name.clone());
            }
        }
    }
    let mut found: Vec<String> = found.into_iter().collect();
    found.sort();
    found
}

/// How a formula's value is shown.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DisplayFormat {
    /// `0.35` shown as `35%`: the formula is a ratio.
    Percent,
    /// `2.5` shown as `2.50`.
    Ratio,
    /// A count, rounded.
    Number,
    /// A result in big blinds per 100 hands, shown with one decimal.
    BbPer100,
}

pub fn format_value(value: f64, format: DisplayFormat) -> String {
    match format {
        DisplayFormat::Percent => format!("{:.0}%", value * 100.0),
        DisplayFormat::Ratio => format!("{value:.2}"),
        DisplayFormat::Number => format!("{value:.0}"),
        DisplayFormat::BbPer100 => format!("{value:.1}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn counts(data: &'static [(&'static str, f64, f64)]) -> impl Fn(&str) -> Option<Counts> {
        move |name| data.iter().find(|(n, _, _)| *n == name).map(|(_, num, den)| Counts { num: *num, den: *den })
    }

    fn eval(text: &str, data: &'static [(&'static str, f64, f64)]) -> Option<f64> {
        evaluate(&parse(text).unwrap(), &counts(data)).map(|e| e.value)
    }

    #[test]
    fn operators_have_the_usual_priority_and_associativity() {
        assert_eq!(eval("1 + 2 * 3", &[]), Some(7.0));
        assert_eq!(eval("(1 + 2) * 3", &[]), Some(9.0));
        assert_eq!(eval("10 - 4 - 3", &[]), Some(3.0), "left to right");
        assert_eq!(eval("100 / 10 / 5", &[]), Some(2.0), "left to right");
        assert_eq!(eval("-2 * -3", &[]), Some(6.0));
        assert_eq!(eval("2 * -(1 + 1)", &[]), Some(-4.0));
        assert_eq!(eval("0.5 + .25", &[]), Some(0.75));
    }

    #[test]
    fn references_read_a_ratio_or_its_counts() {
        const DATA: &[(&str, f64, f64)] = &[("bets", 30.0, 100.0), ("calls", 20.0, 100.0), ("cbet", 6.0, 8.0)];
        // Ratios are 0.3 and 0.2: compared with a tolerance, as floating point does not give 1.5 exactly.
        assert!((eval("bets / calls", DATA).unwrap() - 1.5).abs() < 1e-9);
        assert_eq!(eval("bets.num / calls.num", DATA), Some(1.5));
        assert_eq!(eval("cbet.den", DATA), Some(8.0));
        assert_eq!(eval("cbet * 100", DATA), Some(75.0));
        // The aggression factor: (bets + raises) / calls.
        assert_eq!(eval("(bets.num + 10) / calls.num", DATA), Some(2.0));
    }

    #[test]
    fn no_data_and_division_by_zero_give_no_value() {
        const DATA: &[(&str, f64, f64)] = &[("a", 1.0, 0.0), ("b", 0.0, 10.0), ("c", 5.0, 10.0)];
        assert_eq!(eval("a", DATA), None, "a stat without opportunities has no ratio");
        assert_eq!(eval("c / b", DATA), None, "division by a ratio of zero");
        assert_eq!(eval("1 / 0", DATA), None);
        assert_eq!(eval("missing + 1", DATA), None, "an unknown stat has no data");
        assert_eq!(eval("a.num + 1", DATA), Some(2.0), "counts exist even with no opportunities");
    }

    #[test]
    fn the_sample_is_the_smallest_denominator_of_the_ratios_read() {
        const DATA: &[(&str, f64, f64)] = &[("a", 1.0, 40.0), ("b", 1.0, 12.0)];
        let result = evaluate(&parse("a + b").unwrap(), &counts(DATA)).unwrap();
        assert_eq!(result.sample, 12.0);
        let counts_only = evaluate(&parse("a.num + b.num").unwrap(), &counts(DATA)).unwrap();
        assert_eq!(counts_only.sample, 12.0, "counts weigh by the smallest denominator they come with");
        assert_eq!(evaluate(&parse("2 * 3").unwrap(), &counts(&[])).unwrap().sample, 0.0);
    }

    #[test]
    fn malformed_formulas_are_refused_with_a_position() {
        assert_eq!(parse("   "), Err(ExpressionError::Empty));
        assert_eq!(parse("1 +"), Err(ExpressionError::UnexpectedToken(3)));
        assert_eq!(parse("1 2"), Err(ExpressionError::UnexpectedToken(2)));
        assert_eq!(parse("(1 + 2"), Err(ExpressionError::UnbalancedParenthesis));
        assert_eq!(parse("1 + 2)"), Err(ExpressionError::UnbalancedParenthesis));
        assert_eq!(parse("1 $ 2"), Err(ExpressionError::UnexpectedCharacter(2)));
        assert_eq!(parse("1..2"), Err(ExpressionError::BadNumber(0)));
        assert_eq!(parse("a.b"), Err(ExpressionError::UnexpectedToken(0)));
        assert_eq!(parse("sqrt(4)"), Err(ExpressionError::UnexpectedToken(4)), "no functions: a name then a parenthesis");
        assert!(parse("DROP TABLE hands; --").is_err(), "nothing but arithmetic is accepted");
    }

    #[test]
    fn size_depth_and_reference_limits_apply() {
        assert_eq!(parse(&"1+".repeat(MAX_EXPRESSION_CHARS)), Err(ExpressionError::TooLong));
        let deep = format!("{}1{}", "(".repeat(MAX_EXPRESSION_DEPTH + 2), ")".repeat(MAX_EXPRESSION_DEPTH + 2));
        assert_eq!(parse(&deep), Err(ExpressionError::TooDeep));
        let minuses = format!("{}1", "-".repeat(MAX_EXPRESSION_DEPTH + 2));
        assert_eq!(parse(&minuses), Err(ExpressionError::TooDeep));
        let many = (0..=MAX_REFERENCES).map(|i| format!("s{i}")).collect::<Vec<_>>().join("+");
        assert_eq!(parse(&many), Err(ExpressionError::TooManyReferences));
        let ok = (0..MAX_REFERENCES).map(|i| format!("s{i}")).collect::<Vec<_>>().join("+");
        assert_eq!(references(&parse(&ok).unwrap()).len(), MAX_REFERENCES);
    }

    #[test]
    fn references_are_listed_once_in_order() {
        assert_eq!(references(&parse("b / a + b.num - a.den").unwrap()), vec!["b".to_string(), "a".to_string()]);
    }

    fn graph(edges: &[(&str, &[&str])]) -> HashMap<String, Vec<String>> {
        edges.iter().map(|(name, reads)| (name.to_string(), reads.iter().map(|r| r.to_string()).collect())).collect()
    }

    fn known(names: &[&str]) -> HashSet<String> {
        names.iter().map(|n| n.to_string()).collect()
    }

    #[test]
    fn dependencies_must_exist_and_must_not_loop() {
        let all = known(&["a", "b", "c", "plain"]);
        assert_eq!(check_dependencies(&graph(&[("a", &["plain"]), ("b", &["a", "plain"])]), &all), Ok(()));
        assert_eq!(check_dependencies(&graph(&[("a", &["ghost"])]), &all), Err(ExpressionError::UnknownStat("ghost".into())));
        assert_eq!(check_dependencies(&graph(&[("a", &["a"])]), &all), Err(ExpressionError::Cycle("a".into())));
        assert!(matches!(check_dependencies(&graph(&[("a", &["b"]), ("b", &["c"]), ("c", &["a"])]), &all), Err(ExpressionError::Cycle(_))));
        // A stat read by two others is not a loop.
        assert_eq!(check_dependencies(&graph(&[("a", &["plain"]), ("b", &["a"]), ("c", &["a", "b"])]), &all), Ok(()));
    }

    #[test]
    fn deleting_a_stat_lists_every_formula_that_depends_on_it() {
        let g = graph(&[("a", &["plain"]), ("b", &["a"]), ("c", &["b"]), ("d", &["plain"])]);
        assert_eq!(dependents_of("plain", &g), vec!["a", "b", "c", "d"]);
        assert_eq!(dependents_of("a", &g), vec!["b", "c"]);
        assert!(dependents_of("c", &g).is_empty());
    }

    #[test]
    fn values_are_shown_in_the_chosen_format() {
        assert_eq!(format_value(0.346, DisplayFormat::Percent), "35%");
        assert_eq!(format_value(2.5, DisplayFormat::Ratio), "2.50");
        assert_eq!(format_value(41.6, DisplayFormat::Number), "42");
        assert_eq!(format_value(-3.456, DisplayFormat::BbPer100), "-3.5");
    }
}
