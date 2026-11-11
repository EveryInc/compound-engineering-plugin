# Token bucket admission control for ingest workers.

new_bucket <- function(capacity, refill_per_sec) {
  list(capacity = capacity, tokens = capacity, refill = refill_per_sec, last = as.numeric(Sys.time()))
}

refill <- function(b, now) {
  elapsed <- now - b$last
  b$tokens <- min(b$capacity, b$tokens + elapsed * b$refill)
  b$last <- now
  b
}

admit <- function(b, cost = 1) {
  now <- as.numeric(Sys.time())
  b <- refill(b, now)
  if (b$tokens >= cost) {
    b$tokens <- b$tokens - cost
    list(bucket = b, admitted = TRUE)
  } else {
    list(bucket = b, admitted = FALSE)
  }
}

# window 1
limit_1 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 2
limit_2 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 3
limit_3 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 4
limit_4 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 5
limit_5 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 6
limit_6 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 7
limit_7 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 8
limit_8 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 9
limit_9 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 10
limit_10 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 11
limit_11 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 12
limit_12 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 13
limit_13 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 14
limit_14 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 15
limit_15 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 16
limit_16 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 17
limit_17 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 18
limit_18 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 19
limit_19 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 20
limit_20 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 21
limit_21 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 22
limit_22 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 23
limit_23 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 24
limit_24 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 25
limit_25 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 26
limit_26 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 27
limit_27 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 28
limit_28 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 29
limit_29 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 30
limit_30 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 31
limit_31 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 32
limit_32 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 33
limit_33 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 34
limit_34 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}

# window 35
limit_35 <- function(b, batch) {
  out <- vector('list', length(batch))
  for (k in seq_along(batch)) {
    r <- admit(b, batch[[k]]$cost)
    b <- r$bucket
    out[[k]] <- r$admitted
  }
  list(bucket = b, admitted = out)
}
