-- =============================================================================
-- Localities (Maltese cities / towns / villages)
-- =============================================================================
--
-- Adds one table that holds the locality list shown in the patient Locality
-- dropdown, so localities can be added, renamed or removed from inside the app
-- (Add Patient -> Manage localities) instead of being fixed in the code.
--
-- It is seeded with the standard Maltese localities. Editing the list here or in
-- the app does not change any patient already saved with a locality — their
-- stored value is kept and still shows.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to re-run: it guards itself and the seed never duplicates a name.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.localities (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per name (case-insensitive), so the same locality can't be added twice.
CREATE UNIQUE INDEX IF NOT EXISTS localities_name_uniq
  ON public.localities (lower(name));

-- Seed the standard Maltese localities. ON CONFLICT keeps re-runs harmless.
INSERT INTO public.localities (name) VALUES
  ('Attard'),('Balzan'),('Birgu (Vittoriosa)'),('Birkirkara'),('Birżebbuġa'),
  ('Bormla (Cospicua)'),('Dingli'),('Fgura'),('Floriana'),('Fontana'),
  ('Għajnsielem'),('Għarb'),('Għargħur'),('Għasri'),('Għaxaq'),('Gudja'),
  ('Gżira'),('Ħamrun'),('Iklin'),('Isla (Senglea)'),('Kalkara'),('Kerċem'),
  ('Kirkop'),('Lija'),('Luqa'),('Marsa'),('Marsaskala'),('Marsaxlokk'),
  ('Mdina'),('Mellieħa'),('Mġarr'),('Mosta'),('Mqabba'),('Msida'),('Mtarfa'),
  ('Munxar'),('Nadur'),('Naxxar'),('Paola'),('Pembroke'),('Pietà'),('Qala'),
  ('Qormi'),('Qrendi'),('Rabat'),('Safi'),('San Ġiljan (St Julian''s)'),
  ('San Ġwann'),('San Lawrenz'),('San Pawl il-Baħar (St Paul''s Bay)'),
  ('Sannat'),('Santa Luċija'),('Santa Venera'),('Siġġiewi'),('Sliema'),
  ('Swieqi'),('Tarxien'),('Ta'' Xbiex'),('Valletta'),('Victoria (Rabat, Gozo)'),
  ('Xagħra'),('Xewkija'),('Xgħajra'),('Żabbar'),('Żebbuġ (Malta)'),
  ('Żebbuġ (Gozo)'),('Żejtun'),('Żurrieq')
ON CONFLICT DO NOTHING;

-- Confirm it landed.
SELECT count(*) AS localities FROM public.localities;
