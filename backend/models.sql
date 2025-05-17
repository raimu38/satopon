create table message (
    id serial primary key,
    content text,
    created_at timestamp default now()
)