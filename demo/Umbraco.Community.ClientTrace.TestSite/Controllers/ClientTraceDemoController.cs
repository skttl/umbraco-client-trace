using Microsoft.AspNetCore.Mvc;

namespace Umbraco.Community.ClientTrace.TestSite.Controllers;

public sealed class ClientTraceDemoController : Controller
{
    [HttpGet("/clienttrace-demo")]
    public IActionResult Index() => View();
}
