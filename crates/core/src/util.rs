//! Small text helpers shared by the parsers and the stats code.

/// Case-insensitive equality on upper-cased characters, like `StringComparison.OrdinalIgnoreCase`.
pub(crate) fn eq_ic(a: &str, b: &str) -> bool {
    a.chars().flat_map(char::to_uppercase).eq(b.chars().flat_map(char::to_uppercase))
}

pub(crate) fn starts_with_ic(text: &str, prefix: &str) -> bool {
    let mut t = text.chars().flat_map(char::to_uppercase);
    prefix.chars().flat_map(char::to_uppercase).all(|p| t.next() == Some(p))
}
