/**
 * Controlled vocabulary for skills & interests.
 *
 * Per TRD Section 4.5: skills/interests are NOT free text. They are selected
 * from this fixed list at signup so that Discover matching (city + skills/interests)
 * can use exact-match queries instead of fuzzy text matching.
 */

const SKILLS_BY_CATEGORY = {
  Tech: [
    "AI",
    "Backend Dev",
    "Frontend Dev",
    "Design",
    "Data",
    "Product"
  ],
  Business: [
    "Marketing",
    "Sales",
    "Finance",
    "Operations"
  ],
  Creative: [
    "Writing",
    "Video",
    "Photography"
  ]
};

const INTERESTS_BY_CATEGORY = {
  Fitness: [
    "Gym",
    "Running",
    "Yoga"
  ],
  Sports: [
    "Football",
    "Cricket",
    "Badminton"
  ],
  Lifestyle: [
    "Travel",
    "Food",
    "Music",
    "Reading"
  ],
  Gaming: [
    "PC Gaming",
    "Console Gaming",
    "Mobile Gaming"
  ]
};

function flatten(byCategory) {
  return Object.values(byCategory).reduce((acc, list) => acc.concat(list), []);
}

const ALL_SKILLS = flatten(SKILLS_BY_CATEGORY);
const ALL_INTERESTS = flatten(INTERESTS_BY_CATEGORY);

const INTENTS = [
  "friendship",
  "networking",
  "startup",
  "sports",
  "gaming",
  "hobbies",
  "dating",
  "study"
];

module.exports = {
  SKILLS_BY_CATEGORY,
  INTERESTS_BY_CATEGORY,
  ALL_SKILLS,
  ALL_INTERESTS,
  INTENTS
};
