BEGIN;

CREATE TABLE IF NOT EXISTS boardroom (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  slack_user_id TEXT NOT NULL,
  start TIMESTAMP NOT NULL,
  "end" TIMESTAMP NOT NULL
);

create index idx_boardroom_room on boardroom(room);
create index idx_boardroom_start on boardroom(start);
create index idx_boardroom_end on boardroom("end");

END;
