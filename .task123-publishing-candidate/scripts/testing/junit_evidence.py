"""Read exact JUnit leaves without losing Python class scope.

Unique names retain their existing identity. Only Python names repeated across
distinct, explicit JUnit classnames are qualified. A repeated qualified name
remains a duplicate: consumers must count every occurrence, including failures
and skips, before admitting a passing identity.
"""
from collections import defaultdict
import xml.etree.ElementTree as ET


def read_cases(file, group, default_file=None):
    cases = []

    def collect(element, suites=()):
        if element.tag == "testsuite":
            suites = (*suites, element.get("name", ""))
        if element.tag == "testcase":
            failure = element.find("failure")
            if failure is None:
                failure = element.find("error")
            raw_name = element.get("name")
            cases.append({
                "file": default_file or element.get("file") or (suites[-1] if suites else ""),
                "name": raw_name, "rawName": raw_name,
                "className": element.get("classname"), "suiteNames": list(suites),
                "status": "failed" if failure is not None else "skipped" if element.find("skipped") is not None else "passed",
                "message": failure.get("message", "")[:500] if failure is not None else None,
            })
            return
        for child in element:
            collect(child, suites)

    collect(ET.parse(file).getroot())
    if group == "python":
        by_name = defaultdict(list)
        for case in cases:
            by_name[case["file"], case["rawName"]].append(case)
        for rows in by_name.values():
            scopes = {row["className"] for row in rows}
            if (rows[0]["rawName"] and len(scopes) > 1
                    and all(scope and scope.strip() for scope in scopes)):
                for row in rows:
                    row["name"] = f'{row["className"]}::{row["rawName"]}'
    return cases
