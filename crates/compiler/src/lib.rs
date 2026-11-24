//! Truframe compiler: design document → generated Next.js or Astro project.
//!
//! P2 adds the document model (`model`); adapters and the printer arrive in P3.

pub mod model;

pub use model::Framework;

/// Version of the compiler's output contract. Bumped when generated files change shape.
pub const OUTPUT_VERSION: u32 = 0;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn framework_ids_are_stable() {
        assert_eq!(Framework::Next.id(), "nextjs");
        assert_eq!(Framework::Astro.id(), "astro");
    }
}
