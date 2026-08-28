How we write code here. We care about two things above all. Exported functions
always declare an explicit return type, because our consumers read the
signatures more often than the bodies. And nothing in src ever calls
console.log directly; route it through the log helper so the transport stays
swappable.
