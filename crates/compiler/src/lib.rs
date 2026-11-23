//! Truframe compiler: design document → generated Next.js or Astro project.
//!
//! Stub for P0. The real model, adapters and printer arrive in P2/P3.

/// Version of the compiler's output contract. Bumped when generated files change shape.
pub const OUTPUT_VERSION: u32 = 0;

/// Frameworks the compiler can target.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Framework {
    Next,
    Astro,
}

impl Framework {
    /// Stable identifier stored on project rows and in generated READMEs.
    pub fn id(self) -> &'static str {
        match self {
            Framework::Next => "nextjs",
            Framework::Astro => "astro",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn framework_ids_are_stable() {
        assert_eq!(Framework::Next.id(), "nextjs");
        assert_eq!(Framework::Astro.id(), "astro");
    }
}
