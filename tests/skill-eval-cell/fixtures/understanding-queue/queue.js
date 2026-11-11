export async function claim(db, now) {
  return db.transaction(async tx => {
    const job = await tx.firstReady(now);
    if (!job) return null;
    await tx.lease(job.id, now + 30000);
    return job;
  });
}
