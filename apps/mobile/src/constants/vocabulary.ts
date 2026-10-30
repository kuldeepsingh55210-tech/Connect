/**
 * Controlled vocabulary for Skills, Interests, and Intents.
 * Matches apps/api/src/config/vocabulary.js (TRD Section 4.5 & 6.1).
 */

export interface IntentOption {
  id: string;
  label: string;
  emoji: string;
}

export const INTENT_OPTIONS: IntentOption[] = [
  { id: 'friendship', label: 'Friendship', emoji: '🤝' },
  { id: 'networking', label: 'Networking', emoji: '💼' },
  { id: 'startup', label: 'Startup / Business', emoji: '🚀' },
  { id: 'sports', label: 'Sports', emoji: '🏃' },
  { id: 'gaming', label: 'Gaming', emoji: '🎮' },
  { id: 'hobbies', label: 'Hobbies', emoji: '🎨' },
  { id: 'dating', label: 'Dating', emoji: '☕' },
  { id: 'study', label: 'Study', emoji: '📚' },
];

export const SKILLS_BY_CATEGORY: Record<string, string[]> = {
  Tech: [
    'AI',
    'Backend Dev',
    'Frontend Dev',
    'Design',
    'Data',
    'Product',
  ],
  Business: [
    'Marketing',
    'Sales',
    'Finance',
    'Operations',
  ],
  Creative: [
    'Writing',
    'Video',
    'Photography',
  ],
};

export const INTERESTS_BY_CATEGORY: Record<string, string[]> = {
  Fitness: [
    'Gym',
    'Running',
    'Yoga',
  ],
  Sports: [
    'Football',
    'Cricket',
    'Badminton',
  ],
  Lifestyle: [
    'Travel',
    'Food',
    'Music',
    'Reading',
  ],
  Gaming: [
    'PC Gaming',
    'Console Gaming',
    'Mobile Gaming',
  ],
};

export const SAMPLE_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=500&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=500&q=80',
];
