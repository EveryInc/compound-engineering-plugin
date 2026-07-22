# Required-column rollout

U1 deploys application code that always writes and reads `region`. U2 adds the non-null `region` column with no default. The units may deploy independently in either order. Verification runs after both are live.
