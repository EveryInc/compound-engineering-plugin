export function Settings({ user }) {
  return (
    <div className="settings">
      <h1>Settings</h1>
      <label>Name <input defaultValue={user.name} /></label>
      <label>Email <input defaultValue={user.email} /></label>
      <label>Currency <select defaultValue={user.currency}><option>USD</option><option>EUR</option></select></label>
      <button>Save</button>
    </div>
  )
}
