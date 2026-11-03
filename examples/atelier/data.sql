CREATE SCHEMA IF NOT EXISTS atelier;
CREATE TABLE IF NOT EXISTS atelier.studios (id integer PRIMARY KEY, name text, region text);
CREATE TABLE IF NOT EXISTS atelier.orders (id integer PRIMARY KEY, studio_id integer REFERENCES atelier.studios, total numeric, fulfilled boolean, ordered_on date);
CREATE TABLE IF NOT EXISTS atelier.lines (order_id integer REFERENCES atelier.orders, position integer, price numeric, quantity numeric, PRIMARY KEY(order_id,position));
TRUNCATE atelier.lines, atelier.orders, atelier.studios;
INSERT INTO atelier.studios VALUES (1,'East','Coast'),(2,'West','Inland');
INSERT INTO atelier.orders VALUES (1,1,30,true,'2024-01-01'),(2,1,40,false,'2024-01-02'),(3,2,40,true,'2024-01-03');
INSERT INTO atelier.lines VALUES (1,1,10,1),(1,2,10,2),(2,1,20,2),(3,1,10,4);
