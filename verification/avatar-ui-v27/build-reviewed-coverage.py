"""Read-only coverage assembly from explicitly reviewed QA contact manifests."""
from pathlib import Path
import hashlib,json,datetime
BASE=Path(__file__).resolve().parent
ROOT=BASE.parent.parent
receipt=json.loads((BASE/'reviewed-contact-manifests.json').read_text())
result={'assembledAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'basis':'Only manifests explicitly listed in reviewed-contact-manifests.json; a discovered JPEG is not automatically accepted.','genders':{},'editorScreenshotsReviewedHere':False,'physicalPhoneChecked':False}
for gender in ['g0','g1']:
    merged={};inputs=[]
    for rel in receipt[gender]:
        path=(BASE/rel).resolve()
        if not path.is_relative_to(BASE):raise ValueError('Manifest traversal')
        manifest=json.loads(path.read_text());inputs.append({'path':rel,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
        for row in manifest['records']:
            source=(ROOT/row['source']).resolve()
            if not source.is_relative_to(BASE):raise ValueError('Source traversal')
            actual=hashlib.sha256(source.read_bytes()).hexdigest()
            if actual!=row['sourceSha256']:raise ValueError('Source bytes changed: '+str(source))
            key=(manifest['category'],row['value'],row['direction'])
            merged[key]={**row,'category':manifest['category'],'reviewedContactManifest':rel,'directionVisuallyMatchesLabel':True}
    values={(c,n)for c,n,d in merged}
    for c,n in values:
        if {d for cc,nn,d in merged if (cc,nn)==(c,n)}!={'down','left','up','right'}:raise ValueError('Incomplete direction coverage')
    if len(values)!=receipt['expectedValues'][gender]:raise ValueError('Unexpected value count')
    if gender=='g0':
        for bad in receipt['invalidLegacyCaptures']:
            for d in bad['directions']:
                row=merged[(bad['category'],bad['value'],d)]
                if '/final-fixed/' not in row['source']:raise ValueError('Invalid legacy direction retained')
    result['genders'][gender]={'valuesReviewed':len(values),'fullTargetValues':receipt['fullTargetValuesPerGender'],'completeTarget':len(values)==receipt['fullTargetValuesPerGender'],'uniqueDirectionScreenshots':len(merged),'fromFirstPass':sum('/final/' in r['source']for r in merged.values()),'fromFixedPass':sum('/final-fixed/'in r['source']for r in merged.values()),'reviewedManifests':inputs,'records':list(merged.values())}
(BASE/'reviewed-coverage.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({g:{k:v for k,v in r.items()if k not in ['records','reviewedManifests']}for g,r in result['genders'].items()},ensure_ascii=False))
