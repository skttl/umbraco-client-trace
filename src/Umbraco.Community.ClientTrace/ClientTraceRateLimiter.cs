namespace Umbraco.Community.ClientTrace;

// shortcut: budgets are per process and resolved remote IP, use host proxy configuration and shared infrastructure for cluster-wide limits.
public sealed class ClientTraceRateLimiter
{
    private readonly Dictionary<(string, bool), (long Window, int Count)> _windows = [];
    private readonly object _gate = new();

    public bool TryAcquire(string partition, bool token)
    {
        var now = Environment.TickCount64;
        var key = (partition, token);
        lock (_gate)
        {
            if (_windows.TryGetValue(key, out var window) && now - window.Window < 60_000)
            {
                if (window.Count >= (token ? 10 : 30)) return false;
                _windows[key] = (window.Window, window.Count + 1);
                return true;
            }
            if (_windows.Count >= 4096)
            {
                foreach (var expired in _windows.Where(x => now - x.Value.Window >= 60_000).Select(x => x.Key).ToArray()) _windows.Remove(expired);
                if (_windows.Count >= 4096 && !_windows.ContainsKey(key)) return false;
            }
            _windows[key] = (now, 1);
            return true;
        }
    }
}