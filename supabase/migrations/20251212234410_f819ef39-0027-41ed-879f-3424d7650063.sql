-- Add has_dog preference to profiles
ALTER TABLE public.profiles ADD COLUMN has_dog boolean DEFAULT false;

-- Add dog-related tasks to task library
INSERT INTO public.task_library (category, title, description, difficulty, duration_min, tags, metadata) VALUES
('productive', 'Morning Dog Walk', 'Take your dog for a refreshing 20-minute morning walk. Great for both of you to start the day!', 'easy', 20, '["dog", "morning", "walking"]', '{"requires_dog": true, "time_of_day": "morning"}'),
('productive', 'Afternoon Dog Walk', 'Midday walk with your furry friend. A perfect break to stretch your legs and give your dog exercise.', 'easy', 25, '["dog", "afternoon", "walking"]', '{"requires_dog": true, "time_of_day": "afternoon"}'),
('productive', 'Evening Dog Walk', 'Wind down with a relaxing evening walk with your dog before settling in for the night.', 'easy', 20, '["dog", "evening", "walking"]', '{"requires_dog": true, "time_of_day": "evening"}'),
('rest', 'Dog Playtime', 'Short play session with your dog - fetch, tug-of-war, or just running around. Great stress relief for both!', 'easy', 15, '["dog", "play", "fun"]', '{"requires_dog": true}');