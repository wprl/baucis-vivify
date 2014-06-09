baucis-vivify
=============

A module for adding child controller paths

### controller.vivify

This can be used to add paths under a controller.  For example, a teacher schema might define an array of classrooms.  `controller.vivify` lets embed the classrooms associated with a teacher at a URL like `/teacher/123/classrooms`.

    var teachers = baucis.rest('teacher');
    var classrooms = teachers.vivify('classrooms');

### controller.parentPath

This can be used to note the path the schema defines that is associated with a vivified URL.  For example, in the above example, if the classroom schema didn't use the field `teacher` to link to the teachers collection, but instead used a name of `classTeachers`:

    var teachers = baucis.rest('teacher');
    var classrooms = teachers.vivify('classrooms').parentPath('classTeachers');
