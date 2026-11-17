// Demo contact numbers for the seeded accounts. Ranges reserved for fiction (UK Ofcom drama
// numbers, US 555-01xx), so seeding never points at a real person.
export const DEMO_PHONES: Record<string, { raw: string; region: string }> = {
  "instructor@example.com": { raw: "020 7946 0958", region: "GB" },
  "instructor2@example.com": { raw: "(212) 555-0123", region: "US" },
  "student@example.com": { raw: "+1 416 555 0123", region: "US" },
};
