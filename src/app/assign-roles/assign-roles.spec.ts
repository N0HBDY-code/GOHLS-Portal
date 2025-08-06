import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssignRoles } from './assign-roles';

describe('AssignRoles', () => {
  let component: AssignRoles;
  let fixture: ComponentFixture<AssignRoles>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssignRoles]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AssignRoles);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
