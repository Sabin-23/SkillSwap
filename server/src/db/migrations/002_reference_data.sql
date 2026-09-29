-- ============================================================
-- Reference data required for the platform to operate.
-- (Categories/skills can be edited by administrators afterwards.)
-- ============================================================

INSERT INTO categories (name, description) VALUES
  ('Technology', 'Programming, web development, data and IT skills'),
  ('Design', 'Visual, product and graphic design'),
  ('Languages', 'Spoken and written languages'),
  ('Academics', 'Mathematics, sciences and study skills'),
  ('Business', 'Marketing, management and entrepreneurship'),
  ('Arts & Music', 'Music, drawing, photography and creative arts'),
  ('Lifestyle', 'Cooking, fitness and everyday skills'),
  ('Communication', 'Public speaking, writing and presentation')
ON CONFLICT (name) DO NOTHING;

INSERT INTO skills (name, description, category_id) VALUES
  ('Programming', 'General programming concepts and problem solving', (SELECT id FROM categories WHERE name = 'Technology')),
  ('Web Development', 'Building websites and web applications', (SELECT id FROM categories WHERE name = 'Technology')),
  ('JavaScript', 'JavaScript for browsers and Node.js', (SELECT id FROM categories WHERE name = 'Technology')),
  ('Python', 'Python programming and scripting', (SELECT id FROM categories WHERE name = 'Technology')),
  ('Data Analysis', 'Working with data, spreadsheets and SQL', (SELECT id FROM categories WHERE name = 'Technology')),
  ('Graphic Design', 'Visual design, branding and layout', (SELECT id FROM categories WHERE name = 'Design')),
  ('UI/UX Design', 'Designing user interfaces and experiences', (SELECT id FROM categories WHERE name = 'Design')),
  ('Photography', 'Camera skills, composition and editing', (SELECT id FROM categories WHERE name = 'Arts & Music')),
  ('Music', 'Playing instruments and music theory', (SELECT id FROM categories WHERE name = 'Arts & Music')),
  ('Drawing', 'Sketching and illustration', (SELECT id FROM categories WHERE name = 'Arts & Music')),
  ('Mathematics', 'Algebra, calculus and statistics', (SELECT id FROM categories WHERE name = 'Academics')),
  ('Physics', 'Mechanics, electricity and modern physics', (SELECT id FROM categories WHERE name = 'Academics')),
  ('English', 'English conversation, grammar and writing', (SELECT id FROM categories WHERE name = 'Languages')),
  ('French', 'French conversation and grammar', (SELECT id FROM categories WHERE name = 'Languages')),
  ('Spanish', 'Spanish conversation and grammar', (SELECT id FROM categories WHERE name = 'Languages')),
  ('Kinyarwanda', 'Kinyarwanda conversation and culture', (SELECT id FROM categories WHERE name = 'Languages')),
  ('Marketing', 'Digital marketing and brand strategy', (SELECT id FROM categories WHERE name = 'Business')),
  ('Entrepreneurship', 'Starting and running a small business', (SELECT id FROM categories WHERE name = 'Business')),
  ('Cooking', 'Home cooking and recipes', (SELECT id FROM categories WHERE name = 'Lifestyle')),
  ('Fitness', 'Exercise routines and healthy habits', (SELECT id FROM categories WHERE name = 'Lifestyle')),
  ('Public Speaking', 'Confident presenting and speaking', (SELECT id FROM categories WHERE name = 'Communication')),
  ('Creative Writing', 'Storytelling, essays and blogging', (SELECT id FROM categories WHERE name = 'Communication'))
ON CONFLICT DO NOTHING;

-- Default session pricing (configurable by administrators)
INSERT INTO session_point_rates (duration_minutes, point_cost) VALUES
  (30, 5), (60, 10), (90, 15), (120, 20)
ON CONFLICT (duration_minutes) DO NOTHING;

-- Default bonuses (configurable by administrators)
INSERT INTO point_bonuses (code, name, description, points, condition) VALUES
  ('WELCOME', 'Welcome bonus', 'Starter points granted once when a new account is created.', 20, 'Granted once on registration'),
  ('PROFILE_COMPLETE', 'Profile completed', 'Granted once when the profile reaches 100% completion.', 5, 'Profile completion reaches 100%'),
  ('FIRST_TEACHING_SESSION', 'First teaching session', 'Granted once after the first completed session as a teacher.', 10, 'First completed session as teacher'),
  ('FIVE_TEACHING_SESSIONS', 'Five teaching sessions', 'Granted once after completing five sessions as a teacher.', 15, 'Fifth completed session as teacher')
ON CONFLICT (code) DO NOTHING;
