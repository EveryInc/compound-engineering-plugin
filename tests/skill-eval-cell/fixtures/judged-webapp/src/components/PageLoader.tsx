// Full-screen loading state shown while a page fetches its data.
// Currently a plain spinner that pops in and out with no transition.
export function PageLoader() {
  return <div className="page-loader"><div className="spinner" /></div>
}
