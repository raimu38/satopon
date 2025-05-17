create table if not exists todos (
  id bigint generated always as identity primary key,
  title text not null,
  description text
);

