-- Checkpoint 1: raw data tables loaded from the five CSVs in /data.

CREATE TABLE distributor_master (
  distributor_id   text PRIMARY KEY,
  distributor_name text NOT NULL,
  region           text NOT NULL,
  status           text NOT NULL
);

CREATE TABLE sku_master (
  sku_id               text PRIMARY KEY,
  sku_name             text NOT NULL,
  category             text NOT NULL,
  perishability        text NOT NULL CHECK (perishability IN ('Low', 'High')),
  standard_reorder_qty integer NOT NULL CHECK (standard_reorder_qty > 0),
  unit_of_measure      text NOT NULL,
  distributor_id       text NOT NULL REFERENCES distributor_master (distributor_id)
);

CREATE TABLE weekly_sales (
  sku_id     text NOT NULL REFERENCES sku_master (sku_id),
  week       text NOT NULL CHECK (week ~ '^\d{4}-W\d{2}$'),
  units_sold integer NOT NULL CHECK (units_sold >= 0),
  PRIMARY KEY (sku_id, week)
);

CREATE TABLE current_inventory (
  sku_id        text NOT NULL REFERENCES sku_master (sku_id),
  location      text NOT NULL,
  units_on_hand integer NOT NULL CHECK (units_on_hand >= 0),
  as_of_date    date NOT NULL,
  PRIMARY KEY (sku_id, location)
);

CREATE TABLE calendar (
  year              integer NOT NULL,
  month             integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year_month        text NOT NULL UNIQUE,
  is_festival_month boolean NOT NULL,
  PRIMARY KEY (year, month)
);
