-- Drop legacy seed-only target_majors that duplicate scraper-created rows.
--
-- Initial schema seeded three placeholder rows (ucb_cs, ucla_cs, ucsd_cs)
-- with the human name "Computer Science". The articulation scraper later
-- created canonical rows from assist.org's actual major names:
--   ucb_computer_science               (UCB L&S Computer Science)
--   ucla_computer_science              (UCLA Computer Science/HSSEAS)
--   ucsd_cse_computer_science          (UCSD CSE: Computer Science)
--
-- That left two CS rows visible in the UCB & UCLA major dropdowns. The
-- UCSD seed row is orphaned (UCSD uses the CSE: prefix). Drop the seed
-- ids; ON DELETE CASCADE on transfer_paths / path_articulations /
-- path_articulation_options / path_or_groups / path_or_sections /
-- path_requirements removes their child rows.

delete from target_majors where id in ('ucb_cs', 'ucla_cs', 'ucsd_cs');

-- Strip the trailing-slash artefact from the UCLA scraped CS row so the
-- dropdown reads "Computer Science" instead of "Computer Science/".
update target_majors
   set name = 'Computer Science'
 where id = 'ucla_computer_science'
   and name = 'Computer Science/';

-- Same general cleanup for any other UCLA names that ended up with a
-- trailing slash (artefact of the agreement name normalizer).
update target_majors
   set name = trim(trailing '/' from name)
 where school_id = 'ucla'
   and name like '%/'
   and trim(trailing '/' from name) = trim(trailing '/' from name);
